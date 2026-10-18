import { Injectable } from '@nestjs/common';
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
}
