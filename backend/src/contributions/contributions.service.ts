import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Due, Group, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { fromDbDate, isValidDate, todayIn, toDbDate } from '../common/calendar';
import { parseAmount } from '../common/money';
import { GroupsService } from '../groups/groups.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ContributionRuleError,
  DEFAULT_GRACE_DAYS,
  displayedStatus,
  generateDueDates,
} from './domain/contribution-rules';
import { CreatePlanDto } from './dto/create-plan.dto';

@Injectable()
export class ContributionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly audit: AuditService,
  ) {}

  /** Crée une cotisation et génère les échéances de chaque membre concerné. */
  async createPlan(groupId: string, actor: User, dto: CreatePlanDto) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'group.update',
    });
    for (const date of [dto.startDate, dto.endDate]) {
      if (date !== undefined && !isValidDate(date)) {
        throw new BadRequestException(`La date ${date} n'existe pas.`);
      }
    }

    let dueDates: string[];
    try {
      dueDates = generateDueDates(dto);
    } catch (error) {
      if (error instanceof ContributionRuleError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const cashbox = await this.prisma.cashbox.findFirst({
      where: dto.cashboxId
        ? { id: dto.cashboxId, groupId }
        : { groupId, kind: 'GENERAL' },
    });
    if (!cashbox) throw new NotFoundException('Caisse introuvable.');

    const memberships = await this.prisma.membership.findMany({
      where: {
        groupId,
        status: 'ACTIVE',
        ...(dto.membershipIds ? { id: { in: dto.membershipIds } } : {}),
      },
      select: { id: true },
    });
    if (
      dto.membershipIds &&
      memberships.length !== new Set(dto.membershipIds).size
    ) {
      throw new BadRequestException(
        'Certains membres indiqués ne sont pas des membres actifs du groupe.',
      );
    }

    const amount = parseAmount(dto.amount);
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.contributionPlan.create({
        data: {
          groupId,
          cashboxId: cashbox.id,
          name: dto.name.trim(),
          amount,
          periodicity: dto.periodicity,
          intervalDays:
            dto.periodicity === 'CUSTOM_DAYS' ? dto.intervalDays : null,
          startDate: toDbDate(dto.startDate),
          endDate: dto.endDate ? toDbDate(dto.endDate) : null,
        },
      });
      await tx.due.createMany({
        data: memberships.flatMap((m) =>
          dueDates.map((date) => ({
            membershipId: m.id,
            planId: plan.id,
            amountDue: amount,
            dueDate: toDbDate(date),
          })),
        ),
      });
      await this.audit.log(
        {
          groupId,
          actorId: actor.id,
          action: 'plan.created',
          entity: 'ContributionPlan',
          entityId: plan.id,
          data: {
            amount: dto.amount,
            dueCount: dueDates.length,
            memberCount: memberships.length,
          },
        },
        tx,
      );
      return {
        ...toPlanView(plan),
        dueDatesPerMember: dueDates.length,
        memberCount: memberships.length,
      };
    });
  }

  async listPlans(groupId: string, userId: string) {
    await this.groups.requireMembership(groupId, userId);
    const plans = await this.prisma.contributionPlan.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
    });
    return plans.map(toPlanView);
  }

  /**
   * Échéances du groupe, avec le statut « en retard » calculé au jour du
   * groupe. Par défaut, tout membre voit les échéances de tous (transparence).
   */
  async listDues(
    groupId: string,
    userId: string,
    filter: { membershipId?: string; planId?: string } = {},
  ) {
    await this.groups.requireMembership(groupId, userId);
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
    });
    const dues = await this.prisma.due.findMany({
      where: {
        membership: { groupId },
        planId: filter.planId,
        membershipId: filter.membershipId,
        // Échéances de cotisation uniquement (les tours de tontine viendront à part).
        NOT: { planId: null },
      },
      include: { membership: { include: { user: true } }, plan: true },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    });
    const today = todayIn(group.timezone);
    const graceDays = graceDaysOf(group);
    return dues.map((d) => ({
      id: d.id,
      membershipId: d.membershipId,
      memberName: d.membership.user.fullName,
      planId: d.planId,
      planName: d.plan?.name,
      dueDate: fromDbDate(d.dueDate),
      amountDue: d.amountDue.toString(),
      amountPaid: d.amountPaid.toString(),
      status: displayedStatus(
        { status: storedDueStatus(d), dueDate: fromDbDate(d.dueDate) },
        today,
        graceDays,
      ),
      exemptReason: d.exemptReason,
    }));
  }

  /** Mes échéances dans un groupe, avec le total restant à payer. */
  async myDues(groupId: string, userId: string) {
    const membership = await this.groups.requireMembership(groupId, userId);
    const dues = await this.listDues(groupId, userId, {
      membershipId: membership.id,
    });
    const open = dues.filter(
      (d) => d.status !== 'PAID' && d.status !== 'EXEMPT',
    );
    const outstanding = open.reduce(
      (sum, d) => sum + BigInt(d.amountDue) - BigInt(d.amountPaid),
      0n,
    );
    return {
      membershipId: membership.id,
      outstanding: outstanding.toString(),
      lateCount: open.filter((d) => d.status === 'LATE').length,
      dues,
    };
  }

  /** RG-C3 : exonération décidée par le bureau, motif obligatoire et tracé. */
  async exemptDue(groupId: string, actor: User, dueId: string, reason: string) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'group.update',
    });
    const due = await this.prisma.due.findFirst({
      where: { id: dueId, membership: { groupId } },
    });
    if (!due) throw new NotFoundException('Échéance introuvable.');
    if (due.status === 'PAID' || due.status === 'EXEMPT') {
      throw new ConflictException(
        'Cette échéance est déjà soldée ou exonérée.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.due.update({
        where: { id: due.id },
        data: { status: 'EXEMPT', exemptReason: reason.trim() },
      });
      await this.audit.log(
        {
          groupId,
          actorId: actor.id,
          action: 'due.exempted',
          entity: 'Due',
          entityId: due.id,
          data: { reason: reason.trim() },
        },
        tx,
      );
      return { id: updated.id, status: updated.status };
    });
  }
}

export function graceDaysOf(group: Group): number {
  const rules = group.rules as { graceDays?: unknown } | null;
  return typeof rules?.graceDays === 'number'
    ? rules.graceDays
    : DEFAULT_GRACE_DAYS;
}

function storedDueStatus(due: Due) {
  return due.status === 'LATE' ? 'PENDING' : due.status;
}

function toPlanView(plan: {
  id: string;
  name: string;
  amount: bigint;
  periodicity: string | null;
  intervalDays: number | null;
  startDate: Date;
  endDate: Date | null;
  cashboxId: string;
}) {
  return {
    id: plan.id,
    name: plan.name,
    amount: plan.amount.toString(),
    periodicity: plan.periodicity,
    intervalDays: plan.intervalDays,
    startDate: fromDbDate(plan.startDate),
    endDate: plan.endDate ? fromDbDate(plan.endDate) : null,
    cashboxId: plan.cashboxId,
  };
}
