/**
 * Moteur de calcul d'une tontine rotative (cahier des charges, section 4.4).
 *
 * Logique pure : aucune dépendance à la base ni au framework.
 * Les dates sont des dates calendaires locales au groupe ('YYYY-MM-DD').
 */
import {
  isValidDate,
  nthOccurrence,
  PERIODICITIES,
  type Periodicity,
} from '../../common/calendar';

export { PERIODICITIES, type Periodicity };

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

  const rounds: TontineRound[] = [];
  for (let i = 0; i < shareCount; i++) {
    rounds.push({
      number: i + 1,
      dueDate: nthOccurrence(
        params.startDate,
        i,
        params.periodicity,
        params.intervalDays,
      ),
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.startDate)) {
    throw new TontineParamsError(
      'La date de début doit être au format AAAA-MM-JJ.',
    );
  }
  if (!isValidDate(params.startDate)) {
    throw new TontineParamsError("La date de début n'existe pas.");
  }
}
