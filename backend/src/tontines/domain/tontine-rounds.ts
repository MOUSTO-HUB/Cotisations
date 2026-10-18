/**
 * Règles pures du déroulement d'une tontine (section 4.4, RG-T1 à RG-T5).
 */
import type { DueStatus, RoundStatus } from '@prisma/client';

export class TontineRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TontineRuleError';
  }
}

export const MAX_PARTS_PER_MEMBER = 5;

export interface RoundDue {
  amountDue: bigint;
  amountPaid: bigint;
  status: DueStatus;
}

export function isSettled(due: RoundDue): boolean {
  return due.status === 'PAID' || due.status === 'EXEMPT';
}

/**
 * Statut d'un tour, calculé à partir de ses échéances (jamais stocké, pour
 * rester juste après une annulation de paiement) :
 * à venir → en collecte → complet (RG-T2 : toutes les parts ont payé) → pot versé.
 */
export function roundStatus(
  round: { dueDate: string; paidOutAt: Date | null; dues: readonly RoundDue[] },
  today: string,
): RoundStatus {
  if (round.paidOutAt) return 'PAID_OUT';
  if (round.dues.length > 0 && round.dues.every(isSettled)) return 'COMPLETE';
  const started =
    today >= round.dueDate || round.dues.some((d) => d.amountPaid > 0n);
  return started ? 'COLLECTING' : 'UPCOMING';
}

/** Montant réellement collecté pour un tour (somme des versements). */
export function collectedForRound(dues: readonly RoundDue[]): bigint {
  return dues.reduce((sum, d) => sum + d.amountPaid, 0n);
}

/**
 * Ordre fixé par le président : la liste doit contenir chaque part une et
 * une seule fois. Renvoie le tour attribué à chaque part (1, 2, 3…).
 */
export function turnsFromOrder(
  allShareIds: readonly string[],
  ordered: readonly string[],
): Map<string, number> {
  const unique = new Set(ordered);
  if (
    unique.size !== ordered.length ||
    ordered.length !== allShareIds.length ||
    !allShareIds.every((id) => unique.has(id))
  ) {
    throw new TontineRuleError(
      "L'ordre doit contenir chaque part de la tontine exactement une fois.",
    );
  }
  return new Map(ordered.map((id, i) => [id, i + 1]));
}

/** Un échange n'est possible qu'entre deux tours non versés, de bénéficiaires différents. */
export function assertSwappable(
  a: { paidOutAt: Date | null; beneficiaryMembershipId: string | null },
  b: { paidOutAt: Date | null; beneficiaryMembershipId: string | null },
): void {
  if (a.paidOutAt || b.paidOutAt) {
    throw new TontineRuleError(
      "On ne peut échanger qu'avant le versement des deux pots.",
    );
  }
  if (
    !a.beneficiaryMembershipId ||
    a.beneficiaryMembershipId === b.beneficiaryMembershipId
  ) {
    throw new TontineRuleError(
      "L'échange doit concerner deux bénéficiaires différents.",
    );
  }
}

/**
 * RG-T3 : un membre qui a déjà reçu le pot reste tenu de cotiser jusqu'à la
 * fin du cycle. Il est « défaillant » s'il a des échéances en retard après
 * avoir été servi — information visible de tout le groupe.
 */
export function isDefaulter(member: {
  hasReceivedPot: boolean;
  lateDueCount: number;
}): boolean {
  return member.hasReceivedPot && member.lateDueCount > 0;
}
