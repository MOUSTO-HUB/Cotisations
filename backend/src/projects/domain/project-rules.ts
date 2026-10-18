/**
 * Règles pures des projets communautaires (cahier des charges, section 4.5).
 */
import type { ExpenseStatus, ProjectStatus } from '@prisma/client';

export class ProjectRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectRuleError';
  }
}

/**
 * Cycle de vie en six étapes : proposé → budgétisé → validé → en collecte
 * → en réalisation → achevé. Annulation possible avant la collecte.
 */
export type ProjectAction =
  'setBudget' | 'approve' | 'openCollection' | 'start' | 'complete' | 'cancel';

const TRANSITIONS: Record<
  ProjectAction,
  { from: ProjectStatus[]; to: ProjectStatus; label: string }
> = {
  setBudget: {
    from: ['PROPOSED', 'BUDGETED'],
    to: 'BUDGETED',
    label: 'Le budget ne peut plus être modifié',
  },
  approve: {
    from: ['BUDGETED'],
    to: 'VOTED',
    label: 'Seul un projet budgétisé peut être validé',
  },
  openCollection: {
    from: ['VOTED'],
    to: 'COLLECTING',
    label: 'La collecte ne s’ouvre que pour un projet validé',
  },
  start: {
    from: ['COLLECTING'],
    to: 'IN_PROGRESS',
    label: 'La réalisation ne démarre qu’après l’ouverture de la collecte',
  },
  complete: {
    from: ['IN_PROGRESS'],
    to: 'COMPLETED',
    label: 'Seul un projet en réalisation peut être achevé',
  },
  cancel: {
    from: ['PROPOSED', 'BUDGETED', 'VOTED'],
    to: 'CANCELLED',
    label: 'Un projet ne peut plus être annulé une fois la collecte ouverte',
  },
};

export function nextStatus(
  current: ProjectStatus,
  action: ProjectAction,
): ProjectStatus {
  const t = TRANSITIONS[action];
  if (!t.from.includes(current)) {
    throw new ProjectRuleError(`${t.label} (statut actuel : ${current}).`);
  }
  return t.to;
}

/** Statuts où la caisse du projet peut encore financer des dépenses. */
export const SPENDING_STATUSES: ProjectStatus[] = ['COLLECTING', 'IN_PROGRESS'];

/** Objectif de collecte = budget − fonds déjà affectés − subventions (≥ 0). */
export function collectionTarget(
  budgetTotal: bigint,
  allocatedFunds: bigint,
  subsidies: bigint,
): bigint {
  const target = budgetTotal - allocatedFunds - subsidies;
  return target > 0n ? target : 0n;
}

/** Part proposée par cotisant : objectif ÷ nombre de cotisants, arrondi au-dessus. */
export function suggestedShare(target: bigint, contributors: number): bigint {
  if (contributors < 1) {
    throw new ProjectRuleError('Aucun membre actif pour cotiser.');
  }
  const n = BigInt(contributors);
  return (target + n - 1n) / n;
}

/**
 * Découpe un montant en n versements entiers dont la somme est exacte :
 * le reste de la division est réparti sur les premiers versements.
 */
export function splitInstallments(total: bigint, count: number): bigint[] {
  if (!Number.isInteger(count) || count < 1 || count > 24) {
    throw new ProjectRuleError(
      'Le nombre de versements doit être compris entre 1 et 24.',
    );
  }
  const n = BigInt(count);
  const base = total / n;
  const remainder = Number(total % n);
  return Array.from({ length: count }, (_, i) =>
    i < remainder ? base + 1n : base,
  );
}

/** Alerte de dépassement : plus de 10 % au-dessus du prévu. */
export const OVERRUN_TOLERANCE_PERCENT = 10n;

export interface BudgetLineInput {
  id: string;
  label: string;
  plannedAmount: bigint;
}

export interface ExpenseInput {
  budgetLineId: string | null;
  amount: bigint;
  status: ExpenseStatus;
}

/**
 * Suivi budgétaire par poste : prévu, engagé (en attente de validation),
 * dépensé (exécuté), écart et alerte de dépassement.
 */
export function budgetTracking(
  lines: readonly BudgetLineInput[],
  expenses: readonly ExpenseInput[],
) {
  const sum = (lineId: string | null, status: ExpenseStatus) =>
    expenses
      .filter((e) => e.budgetLineId === lineId && e.status === status)
      .reduce((s, e) => s + e.amount, 0n);

  const rows = lines.map((line) => {
    const committed = sum(line.id, 'PENDING_APPROVAL');
    const spent = sum(line.id, 'EXECUTED');
    return {
      id: line.id,
      label: line.label,
      planned: line.plannedAmount,
      committed,
      spent,
      variance: spent - line.plannedAmount,
      overrun:
        spent * 100n > line.plannedAmount * (100n + OVERRUN_TOLERANCE_PERCENT),
    };
  });
  const totals = rows.reduce(
    (t, r) => ({
      planned: t.planned + r.planned,
      committed: t.committed + r.committed,
      spent: t.spent + r.spent,
    }),
    { planned: 0n, committed: 0n, spent: 0n },
  );
  return {
    lines: rows,
    unassignedSpent: sum(null, 'EXECUTED'),
    totals: {
      ...totals,
      spent: totals.spent + sum(null, 'EXECUTED'),
    },
  };
}
