import type { Currency } from '@prisma/client';

/**
 * Règles financières d'un groupe, stockées dans `Group.rules` (JSON).
 * Valeurs par défaut tirées du cahier des charges (RG-P1, RG-D1).
 */
export interface GroupRules {
  /** Jours de grâce avant qu'une échéance passe « en retard » (RG-P1). */
  graceDays: number;
  /** Au-delà de ce montant, une dépense exige un second validateur (RG-D1). */
  expenseApprovalThreshold: bigint;
}

export const DEFAULT_GRACE_DAYS = 3;

/** Seuil par défaut : ex. 50 000 FCFA ou 750 000 GNF (section 5). */
const DEFAULT_APPROVAL_THRESHOLD: Record<Currency, bigint> = {
  GNF: 750_000n,
  XOF: 50_000n,
  XAF: 50_000n,
  EUR: 75n,
  USD: 85n,
};

export const MAX_GRACE_DAYS = 60;

/** Lit les règles stockées, en complétant avec les valeurs par défaut. */
export function readGroupRules(
  stored: unknown,
  currency: Currency,
): GroupRules {
  const raw = (stored ?? {}) as Record<string, unknown>;
  const graceDays =
    typeof raw.graceDays === 'number' &&
    Number.isInteger(raw.graceDays) &&
    raw.graceDays >= 0 &&
    raw.graceDays <= MAX_GRACE_DAYS
      ? raw.graceDays
      : DEFAULT_GRACE_DAYS;
  const threshold =
    typeof raw.expenseApprovalThreshold === 'string' &&
    /^\d{1,18}$/.test(raw.expenseApprovalThreshold)
      ? BigInt(raw.expenseApprovalThreshold)
      : DEFAULT_APPROVAL_THRESHOLD[currency];
  return { graceDays, expenseApprovalThreshold: threshold };
}

/** Format JSON stocké (les montants en chaîne). */
export function serializeGroupRules(rules: GroupRules) {
  return {
    graceDays: rules.graceDays,
    expenseApprovalThreshold: rules.expenseApprovalThreshold.toString(),
  };
}

/** RG-D1 : « au-delà du seuil », donc strictement supérieur. */
export function needsSecondApproval(
  amount: bigint,
  rules: Pick<GroupRules, 'expenseApprovalThreshold'>,
): boolean {
  return amount > rules.expenseApprovalThreshold;
}
