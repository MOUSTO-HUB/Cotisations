import type { Prisma } from '@prisma/client';

/**
 * Attribue le prochain numéro de reçu du groupe, dans la transaction en
 * cours (paiements et dons partagent la même série).
 * Ex. « R-3F2A9C1E-000042 » : préfixe du groupe + compteur du groupe.
 */
export async function nextReceiptNumber(
  tx: Prisma.TransactionClient,
  groupId: string,
): Promise<string> {
  const group = await tx.group.update({
    where: { id: groupId },
    data: { receiptCounter: { increment: 1 } },
  });
  const prefix = groupId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `R-${prefix}-${String(group.receiptCounter).padStart(6, '0')}`;
}
