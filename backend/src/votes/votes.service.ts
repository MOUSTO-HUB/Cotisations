import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User, Vote } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { hasPermission } from '../groups/domain/permissions';
import { GroupsService } from '../groups/groups.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { tallyVote, VoteTally } from './domain/tally';
import { CreateVoteDto, ProjectVoteDto } from './dto/vote.dto';

/** Options d'un vote de validation de projet : l'option 0 approuve. */
const PROJECT_OPTIONS = ['Pour', 'Contre'];

@Injectable()
export class VotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(groupId: string, actor: User, dto: CreateVoteDto) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'projects.manage',
    });
    return this.open(groupId, actor, {
      question: dto.question.trim(),
      options: dto.options.map((o) => o.trim()),
      quorumPercent: dto.quorumPercent ?? 50,
      closesAt: this.futureDate(dto.closesAt),
      projectId: null,
    });
  }

  /** Vote « Pour / Contre » sur un projet budgétisé (étape 3 du projet). */
  async createForProject(
    groupId: string,
    actor: User,
    projectId: string,
    dto: ProjectVoteDto,
  ) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'projects.manage',
    });
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, groupId },
      include: { votes: { where: { status: 'OPEN' } } },
    });
    if (!project) throw new NotFoundException('Projet introuvable.');
    if (project.status !== 'BUDGETED') {
      throw new ConflictException(
        'Seul un projet budgétisé peut être soumis au vote.',
      );
    }
    if (project.votes.length > 0) {
      throw new ConflictException('Un vote est déjà ouvert pour ce projet.');
    }
    return this.open(groupId, actor, {
      question: `Faut-il réaliser le projet « ${project.title} » (objectif ${project.targetAmount}) ?`,
      options: PROJECT_OPTIONS,
      quorumPercent: dto.quorumPercent ?? 50,
      closesAt: this.futureDate(dto.closesAt),
      projectId,
    });
  }

  async list(groupId: string, userId: string) {
    await this.groups.requireMembership(groupId, userId);
    await this.closeDueVotes(groupId);
    const votes = await this.prisma.vote.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      include: { ballots: true },
    });
    const eligible = await this.activeMembers(groupId);
    return votes.map((v) => this.view(v, v.ballots, eligible));
  }

  async get(groupId: string, userId: string, voteId: string) {
    const membership = await this.groups.requireMembership(groupId, userId);
    await this.closeDueVotes(groupId);
    const vote = await this.findVote(groupId, voteId);
    const ballots = await this.prisma.ballot.findMany({
      where: { voteId },
      include: { membership: { include: { user: true } } },
    });
    return {
      ...this.view(vote, ballots, await this.activeMembers(groupId)),
      myBallot:
        ballots.find((b) => b.membershipId === membership.id)?.optionIndex ??
        null,
      // Bulletin secret : qui a voté, jamais pour quoi.
      voters: ballots.map((b) => b.membership.user.fullName).sort(),
    };
  }

  /** Un membre actif vote une seule fois, tant que le vote est ouvert. */
  async cast(groupId: string, user: User, voteId: string, optionIndex: number) {
    const membership = await this.groups.requireMembership(groupId, user.id);
    await this.closeDueVotes(groupId);
    const vote = await this.findVote(groupId, voteId);
    if (vote.status !== 'OPEN') {
      throw new ConflictException('Ce vote est clos.');
    }
    const options = vote.options as string[];
    if (optionIndex >= options.length) {
      throw new BadRequestException("Cette option n'existe pas.");
    }
    try {
      await this.prisma.ballot.create({
        data: { voteId, membershipId: membership.id, optionIndex },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Vous avez déjà voté.');
      }
      throw error;
    }
    return this.get(groupId, user.id, voteId);
  }

  /** Clôture anticipée par le président (sinon automatique à la date prévue). */
  async close(groupId: string, actor: User, voteId: string) {
    const membership = await this.groups.requireMembership(groupId, actor.id);
    const vote = await this.findVote(groupId, voteId);
    if (
      vote.createdById !== actor.id &&
      !hasPermission(membership.role, 'group.update')
    ) {
      throw new ForbiddenException(
        'Seuls le président ou la personne qui a ouvert le vote peuvent le clore.',
      );
    }
    if (vote.status !== 'OPEN')
      throw new ConflictException('Ce vote est déjà clos.');
    await this.closeVote(vote, actor.id);
    return this.get(groupId, actor.id, voteId);
  }

  // ---- interne ----

  private async open(
    groupId: string,
    actor: User,
    data: {
      question: string;
      options: string[];
      quorumPercent: number;
      closesAt: Date;
      projectId: string | null;
    },
  ) {
    const vote = await this.prisma.$transaction(async (tx) => {
      const created = await tx.vote.create({
        data: { ...data, groupId, createdById: actor.id },
      });
      await this.audit.log(
        {
          groupId,
          actorId: actor.id,
          action: 'vote.opened',
          entity: 'Vote',
          entityId: created.id,
          data: {
            question: data.question,
            options: data.options,
            quorumPercent: data.quorumPercent,
            projectId: data.projectId,
          },
        },
        tx,
      );
      return created;
    });
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
    });
    await this.notifications.notifyActiveMembers(
      groupId,
      `${group.name} : vote ouvert — « ${data.question} ». Votez dans l'application avant le ${data.closesAt.toISOString().slice(0, 10).split('-').reverse().join('/')}.`,
      { excludeUserIds: [actor.id] },
    );
    return this.get(groupId, actor.id, vote.id);
  }

  /** Clôt automatiquement les votes dont la date est passée. */
  private async closeDueVotes(groupId: string) {
    const due = await this.prisma.vote.findMany({
      where: { groupId, status: 'OPEN', closesAt: { lte: new Date() } },
    });
    for (const vote of due) await this.closeVote(vote, null);
  }

  /**
   * Fige le décompte. Un vote de projet gagné par « Pour » fait passer le
   * projet à l'étape « validé » (statut VOTED).
   */
  private async closeVote(vote: Vote, actorId: string | null) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.vote.updateMany({
        where: { id: vote.id, status: 'OPEN' },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      if (claimed.count !== 1) return; // déjà clos en parallèle
      const ballots = await tx.ballot.findMany({ where: { voteId: vote.id } });
      const eligible = await tx.membership.count({
        where: { groupId: vote.groupId, status: 'ACTIVE' },
      });
      const tally = tallyVote(
        (vote.options as string[]).length,
        ballots.map((b) => b.optionIndex),
        eligible,
        vote.quorumPercent,
      );
      await tx.vote.update({
        where: { id: vote.id },
        data: { result: tally as unknown as Prisma.InputJsonValue },
      });
      await this.audit.log(
        {
          groupId: vote.groupId,
          actorId: actorId ?? undefined,
          action: 'vote.closed',
          entity: 'Vote',
          entityId: vote.id,
          data: tally as unknown as Prisma.InputJsonValue,
        },
        tx,
      );
      if (vote.projectId && tally.winnerIndex === 0) {
        const approved = await tx.project.updateMany({
          where: { id: vote.projectId, status: 'BUDGETED' },
          data: {
            status: 'VOTED',
            approvedAt: new Date(),
            approvedById: actorId ?? vote.createdById,
          },
        });
        if (approved.count === 1) {
          await this.audit.log(
            {
              groupId: vote.groupId,
              actorId: actorId ?? undefined,
              action: 'project.approved_by_vote',
              entity: 'Project',
              entityId: vote.projectId,
              data: { voteId: vote.id },
            },
            tx,
          );
        }
      }
    });
  }

  private view(
    vote: Vote,
    ballots: { optionIndex: number }[],
    eligible: number,
  ) {
    const options = vote.options as string[];
    const tally: VoteTally =
      vote.status === 'CLOSED' && vote.result
        ? (vote.result as unknown as VoteTally)
        : tallyVote(
            options.length,
            ballots.map((b) => b.optionIndex),
            eligible,
            vote.quorumPercent,
          );
    return {
      id: vote.id,
      question: vote.question,
      options,
      quorumPercent: vote.quorumPercent,
      closesAt: vote.closesAt,
      status: vote.status,
      projectId: vote.projectId,
      createdById: vote.createdById,
      closedAt: vote.closedAt,
      counts: tally.counts,
      ballots: tally.ballots,
      eligible: tally.eligible,
      participation: tally.participation,
      quorumReached: tally.quorumReached,
      winner: tally.winnerIndex !== null ? options[tally.winnerIndex] : null,
      tie: tally.tie,
    };
  }

  private futureDate(iso: string) {
    const date = new Date(iso);
    if (isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      throw new BadRequestException(
        'La date de clôture doit être dans le futur.',
      );
    }
    return date;
  }

  private activeMembers(groupId: string) {
    return this.prisma.membership.count({
      where: { groupId, status: 'ACTIVE' },
    });
  }

  private async findVote(groupId: string, voteId: string) {
    const vote = await this.prisma.vote.findFirst({
      where: { id: voteId, groupId },
    });
    if (!vote) throw new NotFoundException('Vote introuvable.');
    return vote;
  }
}
