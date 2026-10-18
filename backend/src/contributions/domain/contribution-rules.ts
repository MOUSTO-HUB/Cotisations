/**
 * Règles pures des cotisations (cahier des charges, sections 4.3 et 5).
 */
import {
  addDays,
  nthOccurrence,
  type Periodicity,
} from '../../common/calendar';
import { DEFAULT_GRACE_DAYS } from '../../groups/domain/group-rules';

/** Nombre maximal d'échéances générées pour un plan (ex. 1 an de quotidien). */
export const MAX_OCCURRENCES = 400;

export class ContributionRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContributionRuleError';
  }
}

/**
 * Dates d'échéance d'un plan : une seule pour une cotisation ponctuelle,
 * toutes les occurrences entre début et fin pour une cotisation récurrente.
 */
export function generateDueDates(plan: {
  startDate: string;
  endDate?: string;
  periodicity?: Periodicity;
  intervalDays?: number;
}): string[] {
  if (!plan.periodicity) return [plan.startDate];
  if (!plan.endDate) {
    throw new ContributionRuleError(
      'Une cotisation récurrente doit avoir une date de fin.',
    );
  }
  if (plan.endDate < plan.startDate) {
    throw new ContributionRuleError(
      'La date de fin doit être après la date de début.',
    );
  }

  const dates: string[] = [];
  for (let n = 0; ; n++) {
    const date = nthOccurrence(
      plan.startDate,
      n,
      plan.periodicity,
      plan.intervalDays,
    );
    if (date > plan.endDate) break;
    if (dates.length === MAX_OCCURRENCES) {
      throw new ContributionRuleError(
        `Trop d'échéances : ${MAX_OCCURRENCES} au maximum par cotisation. Raccourcissez la période.`,
      );
    }
    dates.push(date);
  }
  return dates;
}

export interface DueBalance {
  id: string;
  amountDue: bigint;
  amountPaid: bigint;
}

export interface Allocation {
  dueId: string;
  amount: bigint;
}

/**
 * RG-C2 : un paiement est imputé aux échéances dans l'ordre reçu (de la plus
 * ancienne à la plus récente), en soldant chacune avant de passer à la
 * suivante. Payer plusieurs échéances d'avance est donc possible.
 */
export function allocatePayment(
  amount: bigint,
  duesOldestFirst: readonly DueBalance[],
): Allocation[] {
  if (amount <= 0n) {
    throw new ContributionRuleError('Le montant doit être supérieur à zéro.');
  }
  const outstanding = duesOldestFirst.reduce(
    (sum, d) => sum + (d.amountDue - d.amountPaid),
    0n,
  );
  if (amount > outstanding) {
    throw new ContributionRuleError(
      `Le montant dépasse le reste à payer (${outstanding}).`,
    );
  }

  const allocations: Allocation[] = [];
  let remaining = amount;
  for (const due of duesOldestFirst) {
    if (remaining === 0n) break;
    const open = due.amountDue - due.amountPaid;
    if (open <= 0n) continue;
    const applied = remaining < open ? remaining : open;
    allocations.push({ dueId: due.id, amount: applied });
    remaining -= applied;
  }
  return allocations;
}

export type StoredDueStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'EXEMPT';
export type DisplayedDueStatus = StoredDueStatus | 'LATE';

/** Statut stocké après un paiement ou une annulation. */
export function storedStatus(
  amountDue: bigint,
  amountPaid: bigint,
): Exclude<StoredDueStatus, 'EXEMPT'> {
  if (amountPaid >= amountDue) return 'PAID';
  if (amountPaid > 0n) return 'PARTIAL';
  return 'PENDING';
}

/**
 * Statut affiché : une échéance non soldée devient « en retard » une fois le
 * délai de grâce écoulé (RG-P1). Le retard se calcule à la lecture, selon la
 * date du jour dans le fuseau du groupe.
 */
export function displayedStatus(
  due: { status: StoredDueStatus; dueDate: string },
  today: string,
  graceDays: number = DEFAULT_GRACE_DAYS,
): DisplayedDueStatus {
  if (due.status === 'PAID' || due.status === 'EXEMPT') return due.status;
  return today > addDays(due.dueDate, graceDays) ? 'LATE' : due.status;
}
