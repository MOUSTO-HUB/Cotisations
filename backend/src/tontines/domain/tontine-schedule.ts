/**
 * Moteur de calcul d'une tontine rotative (cahier des charges, section 4.4).
 *
 * Logique pure : aucune dépendance à la base ni au framework.
 * Les dates sont des dates calendaires locales au groupe ('YYYY-MM-DD'),
 * sans heure ni fuseau, pour éviter tout décalage d'un jour.
 */

export const PERIODICITIES = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY',
  'CUSTOM_DAYS',
] as const;
export type Periodicity = (typeof PERIODICITIES)[number];

export const MIN_SHARES = 2;
export const MAX_SHARES = 100;

export interface TontineParams {
  /** Montant versé par part et par période, en unités de la devise (GNF, XOF). */
  contributionAmount: bigint;
  /** Nombre de parts (en général, une part par membre). */
  shareCount: number;
  periodicity: Periodicity;
  /** Intervalle en jours, uniquement pour CUSTOM_DAYS (ex. 15 = tous les 15 jours). */
  intervalDays?: number;
  /** Date du premier versement, 'YYYY-MM-DD'. */
  startDate: string;
}

export interface TontineRound {
  /** Numéro du tour, à partir de 1. */
  number: number;
  /** Date de versement du tour, 'YYYY-MM-DD'. */
  dueDate: string;
  potAmount: bigint;
}

export interface TontineSchedule {
  /** Montant du pot reçu par le bénéficiaire de chaque tour. */
  potAmount: bigint;
  /** Nombre de tours : égal au nombre de parts. */
  roundCount: number;
  /** Date du dernier tour. */
  endDate: string;
  /** Total versé par une part sur tout le cycle (égal au pot). */
  totalPerShare: bigint;
  rounds: TontineRound[];
}

export class TontineParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TontineParamsError';
  }
}

export function computeTontineSchedule(params: TontineParams): TontineSchedule {
  validateParams(params);

  const { contributionAmount, shareCount } = params;
  const potAmount = contributionAmount * BigInt(shareCount);
  const start = parseDate(params.startDate);

  const rounds: TontineRound[] = [];
  for (let i = 0; i < shareCount; i++) {
    rounds.push({
      number: i + 1,
      dueDate: formatDate(nthDueDate(start, i, params)),
      potAmount,
    });
  }

  return {
    potAmount,
    roundCount: shareCount,
    endDate: rounds[rounds.length - 1].dueDate,
    totalPerShare: potAmount,
    rounds,
  };
}

function validateParams(params: TontineParams): void {
  if (params.contributionAmount <= 0n) {
    throw new TontineParamsError(
      'Le montant à verser par membre doit être supérieur à zéro.',
    );
  }
  if (
    !Number.isInteger(params.shareCount) ||
    params.shareCount < MIN_SHARES ||
    params.shareCount > MAX_SHARES
  ) {
    throw new TontineParamsError(
      `Le nombre de membres doit être un entier entre ${MIN_SHARES} et ${MAX_SHARES}.`,
    );
  }
  if (!PERIODICITIES.includes(params.periodicity)) {
    throw new TontineParamsError('Période de versement inconnue.');
  }
  if (params.periodicity === 'CUSTOM_DAYS') {
    const d = params.intervalDays;
    if (d === undefined || !Number.isInteger(d) || d < 1 || d > 366) {
      throw new TontineParamsError(
        "L'intervalle personnalisé doit être un nombre de jours entre 1 et 366.",
      );
    }
  }
  parseDate(params.startDate);
}

// ---- Dates calendaires ----

interface CalendarDate {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

function parseDate(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new TontineParamsError(
      'La date de début doit être au format AAAA-MM-JJ.',
    );
  }
  const date = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  if (
    date.month < 1 ||
    date.month > 12 ||
    date.day < 1 ||
    date.day > daysInMonth(date.year, date.month)
  ) {
    throw new TontineParamsError("La date de début n'existe pas.");
  }
  return date;
}

function formatDate({ year, month, day }: CalendarDate): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(date: CalendarDate, days: number): CalendarDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/**
 * Ajoute des mois en gardant le jour d'origine comme ancre :
 * un départ le 31 janvier donne 28 (ou 29) février, puis 31 mars.
 */
function addMonths(date: CalendarDate, months: number): CalendarDate {
  const index = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

function nthDueDate(
  start: CalendarDate,
  n: number,
  params: TontineParams,
): CalendarDate {
  switch (params.periodicity) {
    case 'DAILY':
      return addDays(start, n);
    case 'WEEKLY':
      return addDays(start, 7 * n);
    case 'CUSTOM_DAYS':
      return addDays(start, (params.intervalDays as number) * n);
    case 'MONTHLY':
      return addMonths(start, n);
    case 'YEARLY':
      return addMonths(start, 12 * n);
  }
}
