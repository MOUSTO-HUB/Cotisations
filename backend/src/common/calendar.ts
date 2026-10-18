/**
 * Dates calendaires 'YYYY-MM-DD', sans heure ni fuseau : une échéance tombe
 * un jour donné dans le fuseau du groupe, pas à un instant précis.
 * Les chaînes ISO se comparent directement ('2027-01-05' < '2027-02-01').
 */

export const PERIODICITIES = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY',
  'CUSTOM_DAYS',
] as const;
export type Periodicity = (typeof PERIODICITIES)[number];

interface CalendarDate {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

/** Renvoie la date si elle est au format AAAA-MM-JJ et existe, sinon null. */
export function parseDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
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
    return null;
  }
  return date;
}

export function isValidDate(value: string): boolean {
  return parseDate(value) !== null;
}

function formatDate({ year, month, day }: CalendarDate): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDaysTo(date: CalendarDate, days: number): CalendarDate {
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
function addMonthsTo(date: CalendarDate, months: number): CalendarDate {
  const index = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

function mustParse(value: string): CalendarDate {
  const date = parseDate(value);
  if (!date) throw new RangeError(`Date invalide : ${value}`);
  return date;
}

export function addDays(value: string, days: number): string {
  return formatDate(addDaysTo(mustParse(value), days));
}

/**
 * Date de la n-ième occurrence (n = 0 pour la première) d'une série
 * périodique commençant à `start`.
 */
export function nthOccurrence(
  start: string,
  n: number,
  periodicity: Periodicity,
  intervalDays?: number,
): string {
  const date = mustParse(start);
  switch (periodicity) {
    case 'DAILY':
      return formatDate(addDaysTo(date, n));
    case 'WEEKLY':
      return formatDate(addDaysTo(date, 7 * n));
    case 'CUSTOM_DAYS':
      if (!intervalDays || intervalDays < 1) {
        throw new RangeError('Intervalle personnalisé manquant.');
      }
      return formatDate(addDaysTo(date, intervalDays * n));
    case 'MONTHLY':
      return formatDate(addMonthsTo(date, n));
    case 'YEARLY':
      return formatDate(addMonthsTo(date, 12 * n));
  }
}

/** Date du jour dans un fuseau donné (ex. 'Africa/Conakry'). */
export function todayIn(timezone: string, now: Date = new Date()): string {
  // Le format suédois (sv-SE) donne directement AAAA-MM-JJ.
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Convertit une date calendaire en Date UTC minuit (colonnes Prisma @db.Date). */
export function toDbDate(value: string): Date {
  const date = mustParse(value);
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

export function fromDbDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
