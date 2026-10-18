import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GroupsService } from '../groups/groups.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CashboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
  ) {}

  /** Solde de chaque caisse = entrées − sorties (calculé, jamais stocké). */
  async balances(groupId: string, userId: string) {
    await this.groups.requireMembership(groupId, userId);
    const cashboxes = await this.prisma.cashbox.findMany({
      where: { groupId },
      orderBy: { kind: 'asc' },
    });
    const sums = await this.prisma.movement.groupBy({
      by: ['cashboxId', 'direction'],
      where: { cashbox: { groupId } },
      _sum: { amount: true },
    });
    const total = (cashboxId: string, direction: 'IN' | 'OUT') =>
      sums.find((s) => s.cashboxId === cashboxId && s.direction === direction)
        ?._sum.amount ?? 0n;

    return cashboxes.map((c) => {
      const totalIn = total(c.id, 'IN');
      const totalOut = total(c.id, 'OUT');
      return {
        id: c.id,
        kind: c.kind,
        name: c.name,
        totalIn: totalIn.toString(),
        totalOut: totalOut.toString(),
        balance: (totalIn - totalOut).toString(),
      };
    });
  }

  /**
   * Journal d'une caisse, du plus ancien au plus récent, avec le solde après
   * chaque écriture. Visible de tous les membres (transparence).
   */
  async journal(groupId: string, userId: string, cashboxId: string) {
    await this.groups.requireMembership(groupId, userId);
    const cashbox = await this.prisma.cashbox.findFirst({
      where: { id: cashboxId, groupId },
    });
    if (!cashbox) throw new NotFoundException('Caisse introuvable.');

    const movements = await this.prisma.movement.findMany({
      where: { cashboxId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    let balance = 0n;
    const entries = movements.map((m) => {
      balance += m.direction === 'IN' ? m.amount : -m.amount;
      return {
        id: m.id,
        createdAt: m.createdAt,
        direction: m.direction,
        amount: m.amount.toString(),
        category: m.category,
        label: m.label,
        authorId: m.authorId,
        approvedById: m.approvedById,
        paymentId: m.paymentId,
        expenseId: m.expenseId,
        reversalOfId: m.reversalOfId,
        reason: m.reason,
        balanceAfter: balance.toString(),
      };
    });
    return {
      cashbox: { id: cashbox.id, kind: cashbox.kind, name: cashbox.name },
      balance: balance.toString(),
      entries,
    };
  }

  /**
   * Verrouille la caisse jusqu'à la fin de la transaction et renvoie son
   * solde : deux dépenses simultanées ne peuvent pas la mettre à découvert.
   */
  async lockAndGetBalance(
    tx: Prisma.TransactionClient,
    cashboxId: string,
  ): Promise<bigint> {
    await tx.$queryRaw`SELECT id FROM "Cashbox" WHERE id = ${cashboxId} FOR UPDATE`;
    const sums = await tx.movement.groupBy({
      by: ['direction'],
      where: { cashboxId },
      _sum: { amount: true },
    });
    const sum = (direction: 'IN' | 'OUT') =>
      sums.find((s) => s.direction === direction)?._sum.amount ?? 0n;
    return sum('IN') - sum('OUT');
  }
}
