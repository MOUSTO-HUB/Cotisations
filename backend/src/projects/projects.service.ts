import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Project, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CashboxService } from '../cashbox/cashbox.service';
import {
  fromDbDate,
  isValidDate,
  nthOccurrence,
  toDbDate,
} from '../common/calendar';
import { formatMoney } from '../common/format';
import { parseAmount } from '../common/money';
import { GroupsService } from '../groups/groups.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  budgetTracking,
  collectionTarget,
  nextStatus,
  ProjectAction,
  ProjectRuleError,
  splitInstallments,
  suggestedShare,
} from './domain/project-rules';
import {
  CompleteProjectDto,
  CreateProjectDto,
  OpenCollectionDto,
  ProjectUpdateDto,
  SetBudgetDto,
} from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly cashbox: CashboxService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Étape 1 — Proposé : un membre du bureau décrit le besoin. */
  async create(groupId: string, actor: User, dto: CreateProjectDto) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'projects.manage',
    });
    if (dto.deadline && !isValidDate(dto.deadline)) {
      throw new BadRequestException(`La date ${dto.deadline} n'existe pas.`);
    }
    const project = await this.prisma.$transaction(async (tx) => {
      const title = dto.title.trim();
      const cashbox = await tx.cashbox.create({
        data: { groupId, kind: 'PROJECT', name: `Projet : ${title}` },
      });
      const created = await tx.project.create({
        data: {
          groupId,
          cashboxId: cashbox.id,
          title,
          description: dto.description.trim(),
          deadline: dto.deadline ? toDbDate(dto.deadline) : null,
          proposedById: actor.id,
        },
      });
      await this.log(tx, groupId, actor.id, 'project.proposed', created.id, {
        title,
      });
      return created;
    });
    return this.get(groupId, actor.id, project.id);
  }

  async list(groupId: string, userId: string) {
    await this.groups.requireMembership(groupId, userId);
    const projects = await this.prisma.project.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      projects.map(async (p) => ({
        ...toProjectHeader(p),
        progress: progressOf(
          p,
          (await this.cashbox.summary(p.cashboxId)).collected,
        ),
      })),
    );
  }

  /** Fiche complète : budget par poste, collecte, contributeurs, jalons. */
  async get(groupId: string, userId: string, projectId: string) {
    await this.groups.requireMembership(groupId, userId);
    const project = await this.findProject(groupId, projectId);
    const [lines, expenses, summary, updates, payments, donations] =
      await Promise.all([
        this.prisma.budgetLine.findMany({
          where: { projectId },
          orderBy: { position: 'asc' },
        }),
        this.prisma.expense.findMany({
          where: { cashboxId: project.cashboxId },
        }),
        this.cashbox.summary(project.cashboxId),
        this.prisma.projectUpdate.findMany({
          where: { projectId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.payment.findMany({
          where: { plan: { projectId }, status: { not: 'REVERSED' } },
          include: { membership: { include: { user: true } } },
        }),
        this.prisma.donation.findMany({
          where: { cashboxId: project.cashboxId, status: 'RECORDED' },
        }),
      ]);

    const tracking = budgetTracking(
      lines.map((l) => ({
        id: l.id,
        label: l.label,
        plannedAmount: l.plannedAmount,
      })),
      expenses,
    );
    const contributors = new Map<string, bigint>();
    for (const p of payments) {
      const name = p.membership.user.fullName;
      contributors.set(name, (contributors.get(name) ?? 0n) + p.amount);
    }
    for (const d of donations) {
      contributors.set(
        d.donorName,
        (contributors.get(d.donorName) ?? 0n) + d.amount,
      );
    }

    return {
      ...toProjectHeader(project),
      description: project.description,
      budget: {
        total: tracking.totals.planned.toString(),
        allocatedFunds: project.allocatedFunds.toString(),
        subsidies: project.subsidies.toString(),
        lines: tracking.lines.map((l) => ({
          id: l.id,
          label: l.label,
          planned: l.planned.toString(),
          committed: l.committed.toString(),
          spent: l.spent.toString(),
          variance: l.variance.toString(),
          overrun: l.overrun,
        })),
        unassignedSpent: tracking.unassignedSpent.toString(),
      },
      collection: {
        collected: summary.collected.toString(),
        spent: summary.spent.toString(),
        transferredOut: summary.transferredOut.toString(),
        balance: summary.balance.toString(),
        progress: progressOf(project, summary.collected),
      },
      contributors: [...contributors.entries()]
        .map(([name, amount]) => ({ name, amount: amount.toString() }))
        .sort((a, b) => (BigInt(b.amount) > BigInt(a.amount) ? 1 : -1)),
      updates: updates.map((u) => ({
        id: u.id,
        title: u.title,
        note: u.note,
        photoUrl: u.photoUrl,
        authorId: u.authorId,
        createdAt: u.createdAt,
      })),
    };
  }

  /** Étape 2 — Budgétisé : postes, fonds affectés, subventions → objectif. */
  async setBudget(
    groupId: string,
    actor: User,
    projectId: string,
    dto: SetBudgetDto,
  ) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'projects.manage',
    });
    const project = await this.findProject(groupId, projectId);
    const status = this.transition(project, 'setBudget');

    const lines = dto.lines.map((l, i) => ({
      position: i + 1,
      label: l.label.trim(),
      plannedAmount: parseAmount(l.amount),
    }));
    const total = lines.reduce((s, l) => s + l.plannedAmount, 0n);
    const allocatedFunds = BigInt(dto.allocatedFunds ?? '0');
    const subsidies = BigInt(dto.subsidies ?? '0');
    const targetAmount = collectionTarget(total, allocatedFunds, subsidies);

    await this.prisma.$transaction(async (tx) => {
      // Brouillon révisable : les postes sont remplacés (aucune dépense ne
      // peut encore y être rattachée à ce stade).
      await tx.budgetLine.deleteMany({ where: { projectId } });
      await tx.budgetLine.createMany({
        data: lines.map((l) => ({ ...l, projectId })),
      });
      await tx.project.update({
        where: { id: projectId },
        data: { status, allocatedFunds, subsidies, targetAmount },
      });
      await this.log(tx, groupId, actor.id, 'project.budgeted', projectId, {
        total: total.toString(),
        targetAmount: targetAmount.toString(),
        lines: lines.map((l) => ({
          label: l.label,
          amount: l.plannedAmount.toString(),
        })),
      });
    });
    return this.get(groupId, actor.id, projectId);
  }

  /**
   * Étape 3 — Validé : décision du bureau ou de l'assemblée, enregistrée
   * par le président. Le module de vote viendra la remplacer.
   */
  async approve(groupId: string, actor: User, projectId: string) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'group.update',
    });
    const project = await this.findProject(groupId, projectId);
    const status = this.transition(project, 'approve');
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: projectId },
        data: { status, approvedById: actor.id, approvedAt: new Date() },
      });
      await this.log(tx, groupId, actor.id, 'project.approved', projectId);
    });
    return this.get(groupId, actor.id, projectId);
  }

  /**
   * Étape 4 — En collecte. Mode PER_MEMBER : une part par membre (proposée
   * automatiquement), payable en plusieurs versements ; mode FREE : dons libres.
   */
  async openCollection(
    groupId: string,
    actor: User,
    projectId: string,
    dto: OpenCollectionDto,
  ) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'group.update',
    });
    const project = await this.findProject(groupId, projectId);
    const status = this.transition(project, 'openCollection');
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
    });

    let planSummary: Record<string, unknown> | null = null;
    await this.prisma.$transaction(async (tx) => {
      if (dto.mode === 'PER_MEMBER') {
        planSummary = await this.createMemberPlan(tx, project, dto);
      }
      await tx.project.update({ where: { id: projectId }, data: { status } });
      await this.log(
        tx,
        groupId,
        actor.id,
        'project.collection_opened',
        projectId,
        {
          mode: dto.mode,
          ...(planSummary ?? {}),
        },
      );
    });

    const share = planSummary as { amountPerMember?: string } | null;
    await this.notifications.notifyActiveMembers(
      groupId,
      `${group.name} : collecte ouverte pour le projet « ${project.title} ». ` +
        `Objectif ${formatMoney(project.targetAmount, group.currency)}` +
        (share?.amountPerMember
          ? `, votre part ${formatMoney(BigInt(share.amountPerMember), group.currency)}.`
          : '.'),
      { excludeUserIds: [actor.id] },
    );
    return {
      ...(await this.get(groupId, actor.id, projectId)),
      plan: planSummary,
    };
  }

  /** Étape 5 — En réalisation. */
  async start(groupId: string, actor: User, projectId: string) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'group.update',
    });
    const project = await this.findProject(groupId, projectId);
    const status = this.transition(project, 'start');
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id: projectId }, data: { status } });
      await this.log(tx, groupId, actor.id, 'project.started', projectId);
    });
    return this.get(groupId, actor.id, projectId);
  }

  /** Jalon d'avancement avec photo (fondations, toiture, inauguration…). */
  async addUpdate(
    groupId: string,
    actor: User,
    projectId: string,
    dto: ProjectUpdateDto,
  ) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'projects.manage',
    });
    const project = await this.findProject(groupId, projectId);
    if (!['COLLECTING', 'IN_PROGRESS', 'COMPLETED'].includes(project.status)) {
      throw new ConflictException(
        "Les jalons s'ajoutent à partir de l'ouverture de la collecte.",
      );
    }
    const update = await this.prisma.$transaction(async (tx) => {
      const created = await tx.projectUpdate.create({
        data: {
          projectId,
          authorId: actor.id,
          title: dto.title.trim(),
          note: dto.note?.trim(),
          photoUrl: dto.photoUrl,
        },
      });
      await this.log(tx, groupId, actor.id, 'project.update_added', projectId, {
        title: created.title,
      });
      return created;
    });
    return update;
  }

  /**
   * Étape 6 — Achevé : rapport final (prévu, collecté, dépensé, reliquat).
   * RG-D4 : le reliquat retourne à la caisse générale, sauf décision contraire.
   */
  async complete(
    groupId: string,
    actor: User,
    projectId: string,
    dto: CompleteProjectDto,
  ) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'group.update',
    });
    const project = await this.findProject(groupId, projectId);
    const status = this.transition(project, 'complete');
    const pending = await this.prisma.expense.count({
      where: { cashboxId: project.cashboxId, status: 'PENDING_APPROVAL' },
    });
    if (pending > 0) {
      throw new ConflictException(
        'Des dépenses attendent encore une validation : traitez-les avant de clôturer.',
      );
    }
    const surplusTo = dto.surplus ?? 'GENERAL';

    await this.prisma.$transaction(async (tx) => {
      const balance = await this.cashbox.lockAndGetBalance(
        tx,
        project.cashboxId,
      );
      let transferred = 0n;
      if (surplusTo === 'GENERAL' && balance > 0n) {
        const general = await tx.cashbox.findFirstOrThrow({
          where: { groupId, kind: 'GENERAL' },
        });
        await this.cashbox.transfer(tx, {
          fromCashboxId: project.cashboxId,
          toCashboxId: general.id,
          amount: balance,
          label: `Reliquat du projet « ${project.title} » vers la caisse générale`,
          authorId: actor.id,
        });
        transferred = balance;
      }
      await tx.project.update({
        where: { id: projectId },
        data: { status, completedAt: new Date() },
      });
      await this.log(tx, groupId, actor.id, 'project.completed', projectId, {
        surplus: balance.toString(),
        transferredToGeneral: transferred.toString(),
      });
    });

    const report = await this.get(groupId, actor.id, projectId);
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
    });
    await this.notifications.notifyActiveMembers(
      groupId,
      `${group.name} : le projet « ${project.title} » est achevé. ` +
        `Collecté ${formatMoney(BigInt(report.collection.collected), group.currency)}, ` +
        `dépensé ${formatMoney(BigInt(report.collection.spent), group.currency)}. ` +
        `Rapport complet dans l'application.`,
      { excludeUserIds: [actor.id] },
    );
    return report;
  }

  async cancel(
    groupId: string,
    actor: User,
    projectId: string,
    reason: string,
  ) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'group.update',
    });
    const project = await this.findProject(groupId, projectId);
    const status = this.transition(project, 'cancel');
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: projectId },
        data: { status, cancelReason: reason.trim() },
      });
      await this.log(tx, groupId, actor.id, 'project.cancelled', projectId, {
        reason: reason.trim(),
      });
    });
    return this.get(groupId, actor.id, projectId);
  }

  // ---- interne ----

  private async createMemberPlan(
    tx: Prisma.TransactionClient,
    project: Project,
    dto: OpenCollectionDto,
  ) {
    if (!dto.firstDueDate || !isValidDate(dto.firstDueDate)) {
      throw new BadRequestException(
        'Indiquez une date de premier versement valide (firstDueDate).',
      );
    }
    const installments = dto.installments ?? 1;
    const periodicity = dto.periodicity ?? 'MONTHLY';
    if (periodicity === 'CUSTOM_DAYS' && !dto.intervalDays) {
      throw new BadRequestException("Indiquez l'intervalle en jours.");
    }
    const memberships = await tx.membership.findMany({
      where: {
        groupId: project.groupId,
        status: 'ACTIVE',
        ...(dto.membershipIds ? { id: { in: dto.membershipIds } } : {}),
      },
      select: { id: true },
    });

    let share: bigint;
    let parts: bigint[];
    try {
      share = dto.amountPerMember
        ? parseAmount(dto.amountPerMember)
        : suggestedShare(project.targetAmount, memberships.length);
      if (share <= 0n) {
        throw new ProjectRuleError(
          "L'objectif de collecte est nul : rien à demander aux membres.",
        );
      }
      parts = splitInstallments(share, installments);
    } catch (error) {
      if (error instanceof ProjectRuleError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    const dates = parts.map((_, i) =>
      nthOccurrence(dto.firstDueDate!, i, periodicity, dto.intervalDays),
    );

    const plan = await tx.contributionPlan.create({
      data: {
        groupId: project.groupId,
        cashboxId: project.cashboxId,
        projectId: project.id,
        name: `Projet : ${project.title}`,
        amount: share,
        periodicity: installments > 1 ? periodicity : null,
        intervalDays:
          installments > 1 && periodicity === 'CUSTOM_DAYS'
            ? dto.intervalDays
            : null,
        startDate: toDbDate(dates[0]),
        endDate: toDbDate(dates[dates.length - 1]),
      },
    });
    await tx.due.createMany({
      data: memberships.flatMap((m) =>
        parts.map((amount, i) => ({
          membershipId: m.id,
          planId: plan.id,
          amountDue: amount,
          dueDate: toDbDate(dates[i]),
        })),
      ),
    });
    return {
      planId: plan.id,
      amountPerMember: share.toString(),
      installments: parts.map((amount, i) => ({
        dueDate: dates[i],
        amount: amount.toString(),
      })),
      memberCount: memberships.length,
    };
  }

  private transition(project: Project, action: ProjectAction) {
    try {
      return nextStatus(project.status, action);
    } catch (error) {
      if (error instanceof ProjectRuleError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private async findProject(groupId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, groupId },
    });
    if (!project) throw new NotFoundException('Projet introuvable.');
    return project;
  }

  private log(
    tx: Prisma.TransactionClient,
    groupId: string,
    actorId: string,
    action: string,
    projectId: string,
    data?: Prisma.InputJsonValue,
  ) {
    return this.audit.log(
      {
        groupId,
        actorId,
        action,
        entity: 'Project',
        entityId: projectId,
        data,
      },
      tx,
    );
  }
}

function toProjectHeader(p: Project) {
  return {
    id: p.id,
    title: p.title,
    status: p.status,
    cashboxId: p.cashboxId,
    targetAmount: p.targetAmount.toString(),
    deadline: p.deadline ? fromDbDate(p.deadline) : null,
    proposedById: p.proposedById,
    approvedById: p.approvedById,
    approvedAt: p.approvedAt,
    completedAt: p.completedAt,
    cancelReason: p.cancelReason,
    createdAt: p.createdAt,
  };
}

/** Avancement de la collecte en pourcentage entier (plafonné à 100). */
function progressOf(project: Project, collected: bigint): number {
  if (project.targetAmount <= 0n) return collected > 0n ? 100 : 0;
  const pct = (collected * 100n) / project.targetAmount;
  return Number(pct > 100n ? 100n : pct);
}
