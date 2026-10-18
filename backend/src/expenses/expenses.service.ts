import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Expense, ExpenseStatus, Prisma, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CashboxService } from '../cashbox/cashbox.service';
import { parseAmount } from '../common/money';
import {
  needsSecondApproval,
  readGroupRules,
} from '../groups/domain/group-rules';
import { GroupsService } from '../groups/groups.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly cashbox: CashboxService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Le trésorier saisit une dépense. Jusqu'au seuil du groupe, elle est
   * exécutée tout de suite ; au-delà, elle attend un second validateur
   * (président ou contrôleur) avant de sortir de la caisse (RG-D1).
   */
  async create(groupId: string, actor: User, dto: CreateExpenseDto) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'finance.record',
    });
    const amount = parseAmount(dto.amount);

    const existing = await this.prisma.expense.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      if (
        existing.groupId !== groupId ||
        existing.cashboxId !== dto.cashboxId ||
        existing.amount !== amount
      ) {
        throw new ConflictException(
          'Cette clé de saisie a déjà servi pour une autre dépense.',
        );
      }
      return toExpenseView(existing);
    }

    const cashbox = await this.prisma.cashbox.findFirst({
      where: { id: dto.cashboxId, groupId },
      include: { group: true },
    });
    if (!cashbox) throw new NotFoundException('Caisse introuvable.');
    const rules = readGroupRules(cashbox.group.rules, cashbox.group.currency);
    const pending = needsSecondApproval(amount, rules);

    const expense = await this.prisma.$transaction(async (tx) => {
      // Solde vérifié dès la saisie, puis de nouveau à la validation.
      await this.ensureFunds(tx, cashbox.id, amount);
      const created = await tx.expense.create({
        data: {
          groupId,
          cashboxId: cashbox.id,
          amount,
          category: dto.category.trim(),
          label: dto.label.trim(),
          justificationUrl: dto.justificationUrl,
          status: pending ? 'PENDING_APPROVAL' : 'EXECUTED',
          requestedById: actor.id,
          idempotencyKey: dto.idempotencyKey,
          decidedAt: pending ? null : new Date(),
        },
      });
      if (!pending) await this.writeMovement(tx, created, actor.id, null);
      await this.audit.log(
        {
          groupId,
          actorId: actor.id,
          action: pending ? 'expense.requested' : 'expense.executed',
          entity: 'Expense',
          entityId: created.id,
          data: { amount: dto.amount, label: created.label },
        },
        tx,
      );
      return created;
    });
    return toExpenseView(expense);
  }

  async list(groupId: string, userId: string, status?: ExpenseStatus) {
    await this.groups.requireMembership(groupId, userId);
    const expenses = await this.prisma.expense.findMany({
      where: { groupId, status },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return expenses.map(toExpenseView);
  }

  /** Second validateur : président ou contrôleur, jamais la personne qui a saisi. */
  async approve(groupId: string, actor: User, expenseId: string) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'finance.approve',
    });
    const expense = await this.findPending(groupId, expenseId);
    if (expense.requestedById === actor.id) {
      throw new ForbiddenException(
        'La personne qui a saisi la dépense ne peut pas la valider elle-même.',
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.ensureFunds(tx, expense.cashboxId, expense.amount);
      // Garde contre une double validation simultanée.
      const changed = await tx.expense.updateMany({
        where: { id: expense.id, status: 'PENDING_APPROVAL' },
        data: {
          status: 'EXECUTED',
          approvedById: actor.id,
          decidedAt: new Date(),
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          "Cette dépense n'attend plus de validation.",
        );
      }
      const executed = await tx.expense.findUniqueOrThrow({
        where: { id: expense.id },
      });
      await this.writeMovement(tx, executed, expense.requestedById, actor.id);
      await this.audit.log(
        {
          groupId,
          actorId: actor.id,
          action: 'expense.approved',
          entity: 'Expense',
          entityId: expense.id,
        },
        tx,
      );
      return executed;
    });
    return toExpenseView(updated);
  }

  async reject(
    groupId: string,
    actor: User,
    expenseId: string,
    reason: string,
  ) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'finance.approve',
    });
    const expense = await this.findPending(groupId, expenseId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.expense.update({
        where: { id: expense.id },
        data: {
          status: 'REJECTED',
          rejectionReason: reason.trim(),
          approvedById: actor.id,
          decidedAt: new Date(),
        },
      });
      await this.audit.log(
        {
          groupId,
          actorId: actor.id,
          action: 'expense.rejected',
          entity: 'Expense',
          entityId: expense.id,
          data: { reason: reason.trim() },
        },
        tx,
      );
      return result;
    });
    return toExpenseView(updated);
  }

  /** Ajoute le justificatif d'une dépense « à justifier » (RG-D2). */
  async justify(groupId: string, actor: User, expenseId: string, url: string) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'finance.record',
    });
    const expense = await this.findExpense(groupId, expenseId);
    if (expense.status === 'REJECTED') {
      throw new ConflictException('Cette dépense a été refusée.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.expense.update({
        where: { id: expense.id },
        data: { justificationUrl: url },
      });
      await this.audit.log(
        {
          groupId,
          actorId: actor.id,
          action: 'expense.justified',
          entity: 'Expense',
          entityId: expense.id,
          data: { previous: expense.justificationUrl, url },
        },
        tx,
      );
      return result;
    });
    return toExpenseView(updated);
  }

  /** RG-C4 : une dépense exécutée s'annule par une contre-écriture motivée. */
  async reverse(
    groupId: string,
    actor: User,
    expenseId: string,
    reason: string,
  ) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'finance.record',
    });
    const expense = await this.findExpense(groupId, expenseId);
    if (expense.status !== 'EXECUTED') {
      throw new ConflictException(
        'Seule une dépense exécutée peut être annulée.',
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.expense.updateMany({
        where: { id: expense.id, status: 'EXECUTED' },
        data: { status: 'REVERSED', reversalReason: reason.trim() },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Cette dépense est déjà annulée.');
      }
      const original = await tx.movement.findUniqueOrThrow({
        where: { expenseId: expense.id },
      });
      await tx.movement.create({
        data: {
          cashboxId: original.cashboxId,
          direction: 'IN',
          amount: original.amount,
          category: 'reversal',
          label: `Annulation de la dépense « ${expense.label} »`,
          authorId: actor.id,
          reversalOfId: original.id,
          reason: reason.trim(),
        },
      });
      await this.audit.log(
        {
          groupId,
          actorId: actor.id,
          action: 'expense.reversed',
          entity: 'Expense',
          entityId: expense.id,
          data: { reason: reason.trim() },
        },
        tx,
      );
      return tx.expense.findUniqueOrThrow({ where: { id: expense.id } });
    });
    return toExpenseView(updated);
  }

  private async ensureFunds(
    tx: Prisma.TransactionClient,
    cashboxId: string,
    amount: bigint,
  ) {
    const balance = await this.cashbox.lockAndGetBalance(tx, cashboxId);
    if (amount > balance) {
      throw new BadRequestException(
        `Solde insuffisant : la caisse contient ${balance}.`,
      );
    }
  }

  private writeMovement(
    tx: Prisma.TransactionClient,
    expense: Expense,
    authorId: string,
    approvedById: string | null,
  ) {
    return tx.movement.create({
      data: {
        cashboxId: expense.cashboxId,
        direction: 'OUT',
        amount: expense.amount,
        category: expense.category,
        label: expense.label,
        authorId,
        approvedById,
        expenseId: expense.id,
      },
    });
  }

  private async findExpense(groupId: string, expenseId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, groupId },
    });
    if (!expense) throw new NotFoundException('Dépense introuvable.');
    return expense;
  }

  private async findPending(groupId: string, expenseId: string) {
    const expense = await this.findExpense(groupId, expenseId);
    if (expense.status !== 'PENDING_APPROVAL') {
      throw new ConflictException("Cette dépense n'attend plus de validation.");
    }
    return expense;
  }
}

function toExpenseView(e: Expense) {
  return {
    id: e.id,
    cashboxId: e.cashboxId,
    amount: e.amount.toString(),
    category: e.category,
    label: e.label,
    status: e.status,
    justificationUrl: e.justificationUrl,
    /** RG-D2 : exécutée sans justificatif, signalée dans les rapports. */
    toJustify: e.status === 'EXECUTED' && !e.justificationUrl,
    requestedById: e.requestedById,
    approvedById: e.approvedById,
    rejectionReason: e.rejectionReason,
    reversalReason: e.reversalReason,
    createdAt: e.createdAt,
    decidedAt: e.decidedAt,
  };
}
