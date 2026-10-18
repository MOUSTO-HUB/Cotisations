import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Donation, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { parseAmount } from '../common/money';
import { nextReceiptNumber } from '../common/receipt-number';
import { GroupsService } from '../groups/groups.service';
import { PrismaService } from '../prisma/prisma.service';
import { SPENDING_STATUSES } from '../projects/domain/project-rules';
import { RecordDonationDto } from './dto/record-donation.dto';

@Injectable()
export class DonationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Le trésorier enregistre un don en espèces (membre ou donateur extérieur)
   * vers une caisse du groupe ; un reçu numéroté est émis.
   */
  async record(groupId: string, actor: User, dto: RecordDonationDto) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'finance.record',
    });
    const amount = parseAmount(dto.amount);

    const existing = await this.prisma.donation.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      if (existing.cashboxId !== dto.cashboxId || existing.amount !== amount) {
        throw new ConflictException(
          'Cette clé de saisie a déjà servi pour un autre don.',
        );
      }
      return toDonationView(existing);
    }

    const cashbox = await this.prisma.cashbox.findFirst({
      where: { id: dto.cashboxId, groupId },
      include: { project: true, campaign: true },
    });
    if (!cashbox) throw new NotFoundException('Caisse introuvable.');
    if (
      cashbox.project &&
      !SPENDING_STATUSES.includes(cashbox.project.status)
    ) {
      throw new ConflictException(
        "La collecte de ce projet n'est pas ouverte.",
      );
    }
    if (cashbox.campaign && cashbox.campaign.status !== 'OPEN') {
      throw new ConflictException('Cette collecte de solidarité est close.');
    }

    let donorName = dto.donorName?.trim();
    if (dto.membershipId) {
      const membership = await this.prisma.membership.findFirst({
        where: { id: dto.membershipId, groupId },
        include: { user: true },
      });
      if (!membership) throw new NotFoundException('Membre introuvable.');
      donorName = membership.user.fullName;
    }
    if (!donorName) {
      throw new BadRequestException(
        'Indiquez le membre donateur ou le nom du donateur extérieur.',
      );
    }

    const donation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.donation.create({
        data: {
          groupId,
          cashboxId: cashbox.id,
          membershipId: dto.membershipId,
          donorName: donorName,
          amount,
          channel: 'CASH',
          receiptNumber: await nextReceiptNumber(tx, groupId),
          idempotencyKey: dto.idempotencyKey,
          recordedById: actor.id,
        },
      });
      await tx.movement.create({
        data: {
          cashboxId: cashbox.id,
          direction: 'IN',
          amount,
          category: 'donation',
          label: `Don de ${donorName}`,
          authorId: actor.id,
          donationId: created.id,
        },
      });
      await this.audit.log(
        {
          groupId,
          actorId: actor.id,
          action: 'donation.recorded',
          entity: 'Donation',
          entityId: created.id,
          data: { amount: dto.amount, receiptNumber: created.receiptNumber },
        },
        tx,
      );
      return created;
    });
    return toDonationView(donation);
  }

  async list(groupId: string, userId: string, cashboxId?: string) {
    await this.groups.requireMembership(groupId, userId);
    const donations = await this.prisma.donation.findMany({
      where: { groupId, cashboxId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return donations.map(toDonationView);
  }

  /** RG-C4 : annulation par contre-écriture motivée. */
  async reverse(
    groupId: string,
    actor: User,
    donationId: string,
    reason: string,
  ) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'finance.record',
    });
    const donation = await this.prisma.donation.findFirst({
      where: { id: donationId, groupId },
      include: { movement: true },
    });
    if (!donation || !donation.movement) {
      throw new NotFoundException('Don introuvable.');
    }
    const original = donation.movement;
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.donation.updateMany({
        where: { id: donation.id, status: 'RECORDED' },
        data: { status: 'REVERSED', reversalReason: reason.trim() },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Ce don est déjà annulé.');
      }
      await tx.movement.create({
        data: {
          cashboxId: original.cashboxId,
          direction: 'OUT',
          amount: original.amount,
          category: 'reversal',
          label: `Annulation du reçu ${donation.receiptNumber}`,
          authorId: actor.id,
          reversalOfId: original.id,
          reason: reason.trim(),
        },
      });
      await this.audit.log(
        {
          groupId,
          actorId: actor.id,
          action: 'donation.reversed',
          entity: 'Donation',
          entityId: donation.id,
          data: { reason: reason.trim() },
        },
        tx,
      );
      return tx.donation.findUniqueOrThrow({ where: { id: donation.id } });
    });
    return toDonationView(updated);
  }
}

function toDonationView(d: Donation) {
  return {
    id: d.id,
    receiptNumber: d.receiptNumber,
    cashboxId: d.cashboxId,
    membershipId: d.membershipId,
    donorName: d.donorName,
    amount: d.amount.toString(),
    channel: d.channel,
    status: d.status,
    reversalReason: d.reversalReason,
    createdAt: d.createdAt,
  };
}
