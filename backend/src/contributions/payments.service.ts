import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { fromDbDate } from '../common/calendar';
import { parseAmount } from '../common/money';
import { GroupsService } from '../groups/groups.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  allocatePayment,
  ContributionRuleError,
  storedStatus,
} from './domain/contribution-rules';
import {
  displayedPaymentStatus,
  isConfirmationWindowOpen,
} from './domain/payment-status';
import { RecordCashPaymentDto } from './dto/record-cash-payment.dto';

const PAYMENT_INCLUDE = {
  membership: { include: { user: true, group: true } },
  plan: true,
  allocations: { include: { due: true } },
} satisfies Prisma.PaymentInclude;

type PaymentWithDetails = Prisma.PaymentGetPayload<{
  include: typeof PAYMENT_INCLUDE;
}>;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Le trésorier enregistre un paiement en espèces. L'argent est imputé aux
   * échéances les plus anciennes (RG-C2), un reçu numéroté est émis, et le
   * membre a 7 jours pour confirmer ou contester (RG-C1).
   */
  async recordCash(groupId: string, actor: User, dto: RecordCashPaymentDto) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'finance.record',
    });
    const amount = parseAmount(dto.amount);

    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: PAYMENT_INCLUDE,
    });
    if (existing) {
      const same =
        existing.membershipId === dto.membershipId &&
        existing.planId === dto.planId &&
        existing.amount === amount;
      if (!same) {
        throw new ConflictException(
          'Cette clé de saisie a déjà servi pour un autre paiement.',
        );
      }
      return toReceipt(existing); // même saisie renvoyée : pas de doublon
    }

    const membership = await this.prisma.membership.findFirst({
      where: { id: dto.membershipId, groupId, status: 'ACTIVE' },
      include: { user: true },
    });
    if (!membership) throw new NotFoundException('Membre introuvable.');
    const plan = await this.prisma.contributionPlan.findFirst({
      where: { id: dto.planId, groupId },
    });
    if (!plan) throw new NotFoundException('Cotisation introuvable.');

    const payment = await this.prisma.$transaction(async (tx) => {
      // Verrouille les échéances du membre : deux saisies simultanées ne
      // peuvent pas imputer deux fois la même échéance.
      await tx.$queryRaw`SELECT id FROM "Due" WHERE "membershipId" = ${membership.id} AND "planId" = ${plan.id} FOR UPDATE`;
      const dues = await tx.due.findMany({
        where: {
          membershipId: membership.id,
          planId: plan.id,
          status: { in: ['PENDING', 'PARTIAL', 'LATE'] },
        },
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      });

      let allocations;
      try {
        allocations = allocatePayment(amount, dues);
      } catch (error) {
        if (error instanceof ContributionRuleError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }

      const group = await tx.group.update({
        where: { id: groupId },
        data: { receiptCounter: { increment: 1 } },
      });
      const receiptNumber = formatReceiptNumber(groupId, group.receiptCounter);

      const created = await tx.payment.create({
        data: {
          membershipId: membership.id,
          planId: plan.id,
          amount,
          channel: 'CASH',
          status: 'PENDING_CONFIRMATION',
          idempotencyKey: dto.idempotencyKey,
          receiptNumber,
          recordedById: actor.id,
          allocations: { create: allocations },
        },
      });
      for (const a of allocations) {
        const due = dues.find((d) => d.id === a.dueId)!;
        const amountPaid = due.amountPaid + a.amount;
        await tx.due.update({
          where: { id: due.id },
          data: { amountPaid, status: storedStatus(due.amountDue, amountPaid) },
        });
      }
      await tx.movement.create({
        data: {
          cashboxId: plan.cashboxId,
          direction: 'IN',
          amount,
          category: 'contribution',
          label: `${plan.name} — ${membership.user.fullName}`,
          authorId: actor.id,
          paymentId: created.id,
        },
      });
      await this.audit.log(
        {
          groupId,
          actorId: actor.id,
          action: 'payment.cash_recorded',
          entity: 'Payment',
          entityId: created.id,
          data: {
            amount: dto.amount,
            receiptNumber,
            membershipId: membership.id,
          },
        },
        tx,
      );
      return tx.payment.findUniqueOrThrow({
        where: { id: created.id },
        include: PAYMENT_INCLUDE,
      });
    });
    return toReceipt(payment);
  }

  async listPayments(
    groupId: string,
    userId: string,
    filter: { membershipId?: string } = {},
  ) {
    await this.groups.requireMembership(groupId, userId);
    const payments = await this.prisma.payment.findMany({
      where: { membership: { groupId }, membershipId: filter.membershipId },
      include: PAYMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return payments.map(toReceipt);
  }

  async getReceipt(groupId: string, userId: string, paymentId: string) {
    await this.groups.requireMembership(groupId, userId);
    return toReceipt(await this.findPayment(groupId, paymentId));
  }

  /** Le membre confirme avoir bien remis cette somme (RG-C1). */
  async confirm(groupId: string, user: User, paymentId: string) {
    const payment = await this.findOwnPendingPayment(groupId, user, paymentId);
    return this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });
      await this.audit.log(
        {
          groupId,
          actorId: user.id,
          action: 'payment.confirmed',
          entity: 'Payment',
          entityId: payment.id,
        },
        tx,
      );
      return toReceipt(
        await tx.payment.findUniqueOrThrow({
          where: { id: payment.id },
          include: PAYMENT_INCLUDE,
        }),
      );
    });
  }

  /** Le membre conteste la saisie : le bureau doit trancher. */
  async dispute(
    groupId: string,
    user: User,
    paymentId: string,
    reason: string,
  ) {
    const payment = await this.findOwnPendingPayment(groupId, user, paymentId);
    return this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'DISPUTED', disputeReason: reason.trim() },
      });
      await this.audit.log(
        {
          groupId,
          actorId: user.id,
          action: 'payment.disputed',
          entity: 'Payment',
          entityId: payment.id,
          data: { reason: reason.trim() },
        },
        tx,
      );
      return toReceipt(
        await tx.payment.findUniqueOrThrow({
          where: { id: payment.id },
          include: PAYMENT_INCLUDE,
        }),
      );
    });
  }

  /**
   * RG-C4 : un paiement n'est jamais supprimé. Une erreur s'annule par une
   * contre-écriture motivée, qui rouvre les échéances concernées.
   */
  async reverse(
    groupId: string,
    actor: User,
    paymentId: string,
    reason: string,
  ) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'finance.record',
    });
    const payment = await this.findPayment(groupId, paymentId);
    if (payment.status === 'REVERSED') {
      throw new ConflictException('Ce paiement est déjà annulé.');
    }
    const original = await this.prisma.movement.findUnique({
      where: { paymentId: payment.id },
    });
    if (!original) {
      throw new ConflictException('Écriture de caisse introuvable.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Due" WHERE id IN (${Prisma.join(
        payment.allocations.map((a) => a.dueId),
      )}) FOR UPDATE`;
      for (const a of payment.allocations) {
        const due = await tx.due.findUniqueOrThrow({ where: { id: a.dueId } });
        const amountPaid = due.amountPaid - a.amount;
        await tx.due.update({
          where: { id: due.id },
          data: {
            amountPaid,
            status:
              due.status === 'EXEMPT'
                ? 'EXEMPT'
                : storedStatus(due.amountDue, amountPaid),
          },
        });
      }
      await tx.movement.create({
        data: {
          cashboxId: original.cashboxId,
          direction: 'OUT',
          amount: original.amount,
          category: 'reversal',
          label: `Annulation du reçu ${payment.receiptNumber}`,
          authorId: actor.id,
          reversalOfId: original.id,
          reason: reason.trim(),
        },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'REVERSED', reversalReason: reason.trim() },
      });
      await this.audit.log(
        {
          groupId,
          actorId: actor.id,
          action: 'payment.reversed',
          entity: 'Payment',
          entityId: payment.id,
          data: { reason: reason.trim(), receiptNumber: payment.receiptNumber },
        },
        tx,
      );
      return toReceipt(
        await tx.payment.findUniqueOrThrow({
          where: { id: payment.id },
          include: PAYMENT_INCLUDE,
        }),
      );
    });
  }

  private async findPayment(groupId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, membership: { groupId } },
      include: PAYMENT_INCLUDE,
    });
    if (!payment) throw new NotFoundException('Paiement introuvable.');
    return payment;
  }

  private async findOwnPendingPayment(
    groupId: string,
    user: User,
    paymentId: string,
  ) {
    await this.groups.requireMembership(groupId, user.id);
    const payment = await this.findPayment(groupId, paymentId);
    if (payment.membership.userId !== user.id) {
      throw new ForbiddenException(
        'Seul le membre concerné peut confirmer ou contester ce paiement.',
      );
    }
    if (
      payment.status !== 'PENDING_CONFIRMATION' ||
      !isConfirmationWindowOpen(payment.createdAt, new Date())
    ) {
      throw new ConflictException(
        "Ce paiement n'est plus en attente de confirmation.",
      );
    }
    return payment;
  }
}

/** Ex. « R-3F2A9C1E-000042 » : préfixe du groupe + compteur du groupe. */
function formatReceiptNumber(groupId: string, counter: number): string {
  const prefix = groupId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `R-${prefix}-${String(counter).padStart(6, '0')}`;
}

function toReceipt(p: PaymentWithDetails) {
  const group = p.membership.group;
  return {
    id: p.id,
    receiptNumber: p.receiptNumber,
    group: { id: group.id, name: group.name, currency: group.currency },
    member: {
      membershipId: p.membershipId,
      fullName: p.membership.user.fullName,
      phone: p.membership.user.phone,
    },
    plan: p.plan ? { id: p.plan.id, name: p.plan.name } : null,
    amount: p.amount.toString(),
    channel: p.channel,
    status: displayedPaymentStatus(p.status, p.createdAt, new Date()),
    recordedById: p.recordedById,
    createdAt: p.createdAt,
    confirmedAt: p.confirmedAt,
    disputeReason: p.disputeReason,
    reversalReason: p.reversalReason,
    allocations: p.allocations.map((a) => ({
      dueId: a.dueId,
      dueDate: fromDbDate(a.due.dueDate),
      amount: a.amount.toString(),
    })),
  };
}
