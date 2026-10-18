import { ForbiddenException, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { addDays, fromDbDate, todayIn, toDbDate } from '../common/calendar';
import { penaltyFor, readGroupRules } from '../groups/domain/group-rules';
import { hasPermission } from '../groups/domain/permissions';
import { GroupsService } from '../groups/groups.service';
import { PrismaService } from '../prisma/prisma.service';
import { displayedStatus } from './domain/contribution-rules';

@Injectable()
export class PenaltiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * RG-P2 : ajoute une pénalité (échéance supplémentaire, même cotisation,
   * même caisse) à chaque échéance en retard qui n'en a pas encore.
   * Relancer ne crée jamais de doublon. Le président annule une pénalité
   * avec motif par l'exonération (RG-C3).
   */
  async apply(groupId: string, actor: User) {
    const membership = await this.groups.requireMembership(groupId, actor.id);
    if (
      !hasPermission(membership.role, 'finance.record') &&
      !hasPermission(membership.role, 'group.update')
    ) {
      throw new ForbiddenException(
        'Seuls le trésorier et le président appliquent les pénalités.',
      );
    }
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
    });
    const rules = readGroupRules(group.rules, group.currency);
    if (rules.penaltyMode === 'NONE') {
      return {
        created: 0,
        total: '0',
        message: 'Aucune pénalité prévue par le règlement du groupe.',
      };
    }
    const today = todayIn(group.timezone);
    // En retard : échéance + délai de grâce dépassés (RG-P1).
    const lateBefore = toDbDate(addDays(today, -rules.graceDays));

    const late = await this.prisma.due.findMany({
      where: {
        membership: { groupId },
        planId: { not: null },
        penaltyOfId: null, // pas de pénalité sur une pénalité
        penalty: { is: null },
        status: { in: ['PENDING', 'PARTIAL', 'LATE'] },
        dueDate: { lt: lateBefore },
      },
    });
    const penalties = late
      .map((d) => ({
        membershipId: d.membershipId,
        planId: d.planId,
        penaltyOfId: d.id,
        amountDue: penaltyFor(d.amountDue, rules),
        dueDate: toDbDate(today),
      }))
      .filter((p) => p.amountDue > 0n);

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.due.createMany({
        data: penalties,
        skipDuplicates: true, // une seule pénalité par retard, même en parallèle
      });
      const total = penalties.reduce((s, p) => s + p.amountDue, 0n);
      if (result.count > 0) {
        await this.audit.log(
          {
            groupId,
            actorId: actor.id,
            action: 'penalties.applied',
            entity: 'Group',
            entityId: groupId,
            data: {
              count: result.count,
              mode: rules.penaltyMode,
              value: rules.penaltyValue.toString(),
            },
          },
          tx,
        );
      }
      return { created: result.count, total: total.toString() };
    });
  }

  /**
   * RG-P3 : membres ayant atteint le seuil de retards du groupe, pour que le
   * bureau intervienne (cotisations et tontines confondues).
   */
  async alerts(groupId: string, userId: string) {
    await this.groups.requireMembership(groupId, userId, {
      permission: 'audit.read',
    });
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
    });
    const rules = readGroupRules(group.rules, group.currency);
    const today = todayIn(group.timezone);
    const open = await this.prisma.due.findMany({
      where: {
        membership: { groupId, status: 'ACTIVE' },
        status: { in: ['PENDING', 'PARTIAL', 'LATE'] },
        penaltyOfId: null,
      },
      include: { membership: { include: { user: true } } },
    });

    const byMember = new Map<
      string,
      { name: string; phone: string; lateDueCount: number; lateAmount: bigint }
    >();
    for (const d of open) {
      const status = displayedStatus(
        {
          status: d.status === 'LATE' ? 'PENDING' : d.status,
          dueDate: fromDbDate(d.dueDate),
        },
        today,
        rules.graceDays,
      );
      if (status !== 'LATE') continue;
      const entry = byMember.get(d.membershipId) ?? {
        name: d.membership.user.fullName,
        phone: d.membership.user.phone,
        lateDueCount: 0,
        lateAmount: 0n,
      };
      entry.lateDueCount++;
      entry.lateAmount += d.amountDue - d.amountPaid;
      byMember.set(d.membershipId, entry);
    }
    return {
      threshold: rules.lateAlertThreshold,
      members: [...byMember.entries()]
        .filter(([, m]) => m.lateDueCount >= rules.lateAlertThreshold)
        .sort((a, b) => b[1].lateDueCount - a[1].lateDueCount)
        .map(([membershipId, m]) => ({
          membershipId,
          name: m.name,
          phone: m.phone,
          lateDueCount: m.lateDueCount,
          lateAmount: m.lateAmount.toString(),
        })),
    };
  }
}
