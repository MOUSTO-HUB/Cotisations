import type { MovementDirection } from '@prisma/client';

export interface MovementLike {
  direction: MovementDirection;
  amount: bigint;
  category: string;
}

/**
 * Résumé d'une caisse à partir de son journal, en neutralisant les
 * contre-écritures : une annulation sortante (category « reversal », OUT)
 * annule une entrée, une annulation entrante annule une dépense.
 */
export function summarizeMovements(movements: readonly MovementLike[]) {
  let collected = 0n; // cotisations et dons reçus
  let spent = 0n; // dépenses exécutées
  let transferredIn = 0n;
  let transferredOut = 0n;
  for (const m of movements) {
    if (m.category === 'transfer') {
      if (m.direction === 'IN') transferredIn += m.amount;
      else transferredOut += m.amount;
    } else if (m.category === 'reversal') {
      if (m.direction === 'OUT') collected -= m.amount;
      else spent -= m.amount;
    } else if (m.direction === 'IN') {
      collected += m.amount;
    } else {
      spent += m.amount;
    }
  }
  return {
    collected,
    spent,
    transferredIn,
    transferredOut,
    balance: collected + transferredIn - spent - transferredOut,
  };
}
