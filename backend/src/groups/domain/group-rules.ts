import type { Currency } from '@prisma/client';

/**
 * Règles financières d'un groupe, stockées dans `Group.rules` (JSON).
 * Valeurs par défaut tirées du cahier des charges (RG-P1 à RG-P3, RG-D1).
 */
export const PENALTY_MODES = ['NONE', 'FIXED', 'PERCENT'] as const;
export type PenaltyMode = (typeof PENALTY_MODES)[number];

export interface GroupRules {
  /** Jours de grâce avant qu'une échéance passe « en retard » (RG-P1). */
  graceDays: number;
  /** Au-delà de ce montant, une dépense exige un second validateur (RG-D1). */
  expenseApprovalThreshold: bigint;
  /** RG-P2 : aucune pénalité, montant fixe, ou pourcentage de l'échéance. */
  penaltyMode: PenaltyMode;
  /** Montant (FIXED, en unités de la devise) ou pourcentage (PERCENT, 1 à 100). */
  penaltyValue: bigint;
  /** RG-P3 : nombre de retards qui déclenche une alerte au bureau. */
  lateAlertThreshold: number;
}

export const DEFAULT_GRACE_DAYS = 3;
export const DEFAULT_LATE_ALERT_THRESHOLD = 3;
export const MAX_GRACE_DAYS = 60;

/** Seuil par défaut : ex. 50 000 FCFA ou 750 000 GNF (section 5). */
const DEFAULT_APPROVAL_THRESHOLD: Record<Currency, bigint> = {
  GNF: 750_000n,
  XOF: 50_000n,
  XAF: 50_000n,
  EUR: 75n,
  USD: 85n,
};

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

const isAmount = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{1,18}$/.test(v);

/** Lit les règles stockées, en complétant avec les valeurs par défaut. */
export function readGroupRules(
  stored: unknown,
  currency: Currency,
): GroupRules {
  const raw = (stored ?? {}) as Record<string, unknown>;
  const penaltyMode = PENALTY_MODES.includes(raw.penaltyMode as PenaltyMode)
    ? (raw.penaltyMode as PenaltyMode)
    : 'NONE';
  return {
    graceDays: isInt(raw.graceDays, 0, MAX_GRACE_DAYS)
      ? raw.graceDays
      : DEFAULT_GRACE_DAYS,
    expenseApprovalThreshold: isAmount(raw.expenseApprovalThreshold)
      ? BigInt(raw.expenseApprovalThreshold)
      : DEFAULT_APPROVAL_THRESHOLD[currency],
    penaltyMode,
    penaltyValue:
      penaltyMode !== 'NONE' && isAmount(raw.penaltyValue)
        ? BigInt(raw.penaltyValue)
        : 0n,
    lateAlertThreshold: isInt(raw.lateAlertThreshold, 1, 100)
      ? raw.lateAlertThreshold
      : DEFAULT_LATE_ALERT_THRESHOLD,
  };
}

/** Format JSON stocké (les montants en chaîne). */
export function serializeGroupRules(rules: GroupRules) {
  return {
    graceDays: rules.graceDays,
    expenseApprovalThreshold: rules.expenseApprovalThreshold.toString(),
    penaltyMode: rules.penaltyMode,
    penaltyValue: rules.penaltyValue.toString(),
    lateAlertThreshold: rules.lateAlertThreshold,
  };
}

/** RG-D1 : « au-delà du seuil », donc strictement supérieur. */
export function needsSecondApproval(
  amount: bigint,
  rules: Pick<GroupRules, 'expenseApprovalThreshold'>,
): boolean {
  return amount > rules.expenseApprovalThreshold;
}

/**
 * RG-P2 : montant de la pénalité d'une échéance en retard. En pourcentage,
 * arrondi à l'unité inférieure, au moins 1 dès que le montant est positif.
 */
export function penaltyFor(
  amountDue: bigint,
  rules: Pick<GroupRules, 'penaltyMode' | 'penaltyValue'>,
): bigint {
  switch (rules.penaltyMode) {
    case 'NONE':
      return 0n;
    case 'FIXED':
      return rules.penaltyValue;
    case 'PERCENT': {
      const value = (amountDue * rules.penaltyValue) / 100n;
      return value === 0n && amountDue > 0n && rules.penaltyValue > 0n
        ? 1n
        : value;
    }
  }
}
