import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SolidarityCampaign, SolidarityReason, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CashboxService } from '../cashbox/cashbox.service';
import { fromDbDate, isValidDate, toDbDate } from '../common/calendar';
import { formatDayFr, formatMoney } from '../common/format';
import { parseAmount } from '../common/money';
import { GroupsService } from '../groups/groups.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CloseCampaignDto, OpenCampaignDto } from './dto/campaign.dto';

/** Motif affiché à tous : général, jamais de diagnostic. */
const REASON_LABELS: Record<SolidarityReason, string> = {
  HEALTH: 'raison de santé',
  DEATH: 'décès',
  DISASTER: 'sinistre',
  OTHER: 'solidarité',
};

@Injectable()
export class SolidarityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly cashbox: CashboxService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Un membre du bureau ouvre une collecte d'urgence ; tous les membres sont
   * prévenus par SMS. Les versements au bénéficiaire passent par les
   * dépenses de la caisse de la collecte, toujours avec un second validateur
   * (RG-S1).
   */
  async open(groupId: string, actor: User, dto: OpenCampaignDto) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'campaigns.open',
    });
    if (!isValidDate(dto.deadline)) {
      throw new BadRequestException(`La date ${dto.deadline} n'existe pas.`);
    }
    if (dto.mandatory && !dto.suggestedAmount) {
      throw new BadRequestException(
        'Une collecte obligatoire exige un montant par membre (suggestedAmount).',
      );
    }
    if (dto.beneficiaryMembershipId) {
      const beneficiary = await this.prisma.membership.findFirst({
        where: { id: dto.beneficiaryMembershipId, groupId },
      });
      if (!beneficiary)
        throw new NotFoundException('Bénéficiaire introuvable.');
    }
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
    });
    const targetAmount = parseAmount(dto.targetAmount);
    const suggestedAmount = dto.suggestedAmount
      ? parseAmount(dto.suggestedAmount)
      : null;
    const beneficiaryName = dto.beneficiaryName.trim();
    const reason = dto.reasonNote?.trim()
      ? `${REASON_LABELS[dto.reasonCategory]} — ${dto.reasonNote.trim()}`
      : REASON_LABELS[dto.reasonCategory];

    const campaign = await this.prisma.$transaction(async (tx) => {
      const cashbox = await tx.cashbox.create({
        data: {
          groupId,
          kind: 'SOLIDARITY',
          name: `Collecte : ${beneficiaryName}`,
        },
      });
      const created = await tx.solidarityCampaign.create({
        data: {
          groupId,
          cashboxId: cashbox.id,
          beneficiaryName,
          beneficiaryMembershipId: dto.beneficiaryMembershipId,
          reasonCategory: dto.reasonCategory,
          reason,
          targetAmount,
          suggestedAmount,
          mandatory: dto.mandatory ?? false,
          deadline: toDbDate(dto.deadline),
          openedById: actor.id,
        },
      });

      // RG-S4 : collecte obligatoire = une échéance par membre actif
      // (le bénéficiaire en est dispensé).
      if (created.mandatory && suggestedAmount) {
        const plan = await tx.contributionPlan.create({
          data: {
            groupId,
            cashboxId: cashbox.id,
            campaignId: created.id,
            name: `Solidarité : ${beneficiaryName}`,
            amount: suggestedAmount,
            startDate: toDbDate(dto.deadline),
          },
        });
        const members = await tx.membership.findMany({
          where: {
            groupId,
            status: 'ACTIVE',
            id: { not: dto.beneficiaryMembershipId ?? undefined },
          },
          select: { id: true },
        });
        await tx.due.createMany({
          data: members.map((m) => ({
            membershipId: m.id,
            planId: plan.id,
            amountDue: suggestedAmount,
            dueDate: toDbDate(dto.deadline),
          })),
        });
      }

      await this.audit.log(
        {
          groupId,
          actorId: actor.id,
          action: 'campaign.opened',
          entity: 'SolidarityCampaign',
          entityId: created.id,
          data: {
            beneficiaryName,
            reasonCategory: dto.reasonCategory,
            targetAmount: dto.targetAmount,
            mandatory: created.mandatory,
          },
        },
        tx,
      );
      return created;
    });

    const contribution = suggestedAmount
      ? ` ${campaign.mandatory ? 'Cotisation' : 'Contribution suggérée'} : ${formatMoney(suggestedAmount, group.currency)}.`
      : '';
    const notified = await this.notifications.notifyActiveMembers(
      groupId,
      `${group.name} : collecte de solidarité pour ${beneficiaryName} (${REASON_LABELS[dto.reasonCategory]}). ` +
        `Objectif ${formatMoney(targetAmount, group.currency)} avant le ${formatDayFr(dto.deadline)}.${contribution}`,
      { excludeUserIds: [actor.id] },
    );
    return { ...(await this.view(campaign)), notifiedMembers: notified };
  }

  async list(groupId: string, userId: string) {
    await this.groups.requireMembership(groupId, userId);
    const campaigns = await this.prisma.solidarityCampaign.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(campaigns.map((c) => this.view(c)));
  }

  async get(groupId: string, userId: string, campaignId: string) {
    await this.groups.requireMembership(groupId, userId);
    return this.view(await this.findCampaign(groupId, campaignId));
  }

  /**
   * Clôture. RG-S3 : l'excédent va au fonds de solidarité permanent, ou reste
   * dans la caisse de la collecte pour être versé au bénéficiaire.
   */
  async close(
    groupId: string,
    actor: User,
    campaignId: string,
    dto: CloseCampaignDto,
  ) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'group.update',
    });
    const campaign = await this.findCampaign(groupId, campaignId);
    if (campaign.status !== 'OPEN') {
      throw new ConflictException('Cette collecte est déjà close.');
    }
    const pending = await this.prisma.expense.count({
      where: { cashboxId: campaign.cashboxId, status: 'PENDING_APPROVAL' },
    });
    if (pending > 0) {
      throw new ConflictException(
        'Un versement attend encore sa validation : traitez-le avant de clôturer.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const balance = await this.cashbox.lockAndGetBalance(
        tx,
        campaign.cashboxId,
      );
      let transferred = 0n;
      if (dto.surplusTo === 'SOLIDARITY_FUND' && balance > 0n) {
        const fund = await tx.cashbox.findFirst({
          where: { groupId, kind: 'SOLIDARITY', campaign: null },
        });
        if (!fund) {
          throw new ConflictException(
            "Ce groupe n'a pas de fonds de solidarité permanent.",
          );
        }
        await this.cashbox.transfer(tx, {
          fromCashboxId: campaign.cashboxId,
          toCashboxId: fund.id,
          amount: balance,
          label: `Excédent de la collecte pour ${campaign.beneficiaryName}`,
          authorId: actor.id,
        });
        transferred = balance;
      }
      await tx.solidarityCampaign.update({
        where: { id: campaign.id },
        data: {
          status: balance - transferred === 0n ? 'PAID_OUT' : 'CLOSED',
          closedAt: new Date(),
        },
      });
      await this.audit.log(
        {
          groupId,
          actorId: actor.id,
          action: 'campaign.closed',
          entity: 'SolidarityCampaign',
          entityId: campaign.id,
          data: {
            surplusTo: dto.surplusTo,
            surplus: balance.toString(),
            transferredToFund: transferred.toString(),
          },
        },
        tx,
      );
    });
    return this.get(groupId, actor.id, campaignId);
  }

  private async findCampaign(groupId: string, campaignId: string) {
    const campaign = await this.prisma.solidarityCampaign.findFirst({
      where: { id: campaignId, groupId },
    });
    if (!campaign) throw new NotFoundException('Collecte introuvable.');
    return campaign;
  }

  private async view(c: SolidarityCampaign) {
    const summary = await this.cashbox.summary(c.cashboxId);
    const pct =
      c.targetAmount > 0n ? (summary.collected * 100n) / c.targetAmount : 0n;
    return {
      id: c.id,
      cashboxId: c.cashboxId,
      beneficiaryName: c.beneficiaryName,
      beneficiaryMembershipId: c.beneficiaryMembershipId,
      reasonCategory: c.reasonCategory,
      reason: c.reason,
      targetAmount: c.targetAmount.toString(),
      suggestedAmount: c.suggestedAmount?.toString() ?? null,
      mandatory: c.mandatory,
      deadline: fromDbDate(c.deadline),
      status: c.status,
      openedById: c.openedById,
      createdAt: c.createdAt,
      closedAt: c.closedAt,
      collected: summary.collected.toString(),
      paidOut: summary.spent.toString(),
      transferredToFund: summary.transferredOut.toString(),
      balance: summary.balance.toString(),
      progress: Number(pct > 100n ? 100n : pct),
    };
  }
}
