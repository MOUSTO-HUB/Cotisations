/**
 * Normalisation des numéros de téléphone au format E.164 (+224620000000).
 *
 * Pays de lancement : Guinée, Sénégal, Côte d'Ivoire. Un numéro saisi sans
 * indicatif est interprété dans le pays par défaut de l'utilisateur ; un
 * numéro avec indicatif (+33, 0033…) est accepté pour la diaspora.
 */

interface CountryRule {
  dialCode: string;
  /** Longueur du numéro national, sans indicatif. */
  nationalLength: number;
}

export const COUNTRY_RULES = {
  GN: { dialCode: '224', nationalLength: 9 },
  SN: { dialCode: '221', nationalLength: 9 },
  CI: { dialCode: '225', nationalLength: 10 },
} as const satisfies Record<string, CountryRule>;

export type LaunchCountry = keyof typeof COUNTRY_RULES;

export class InvalidPhoneError extends Error {
  constructor() {
    super('Numéro de téléphone invalide.');
    this.name = 'InvalidPhoneError';
  }
}

export function normalizePhone(
  input: string,
  defaultCountry: LaunchCountry = 'GN',
): string {
  const trimmed = input.trim();
  if (!/^[+\d\s().-]+$/.test(trimmed)) throw new InvalidPhoneError();

  let digits = trimmed.replace(/\D/g, '');
  let international = trimmed.startsWith('+');
  if (!international && digits.startsWith('00')) {
    digits = digits.slice(2);
    international = true;
  }

  if (!international) {
    const rule = COUNTRY_RULES[defaultCountry];
    if (
      digits.startsWith(rule.dialCode) &&
      digits.length === rule.dialCode.length + rule.nationalLength
    ) {
      return `+${digits}`;
    }
    if (digits.length !== rule.nationalLength) throw new InvalidPhoneError();
    return `+${rule.dialCode}${digits}`;
  }

  // Indicatif d'un pays de lancement : la longueur nationale est vérifiée.
  for (const rule of Object.values(COUNTRY_RULES)) {
    if (digits.startsWith(rule.dialCode)) {
      if (digits.length !== rule.dialCode.length + rule.nationalLength) {
        throw new InvalidPhoneError();
      }
      return `+${digits}`;
    }
  }

  // Autres pays (diaspora) : règle générale E.164, 8 à 15 chiffres.
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) {
    throw new InvalidPhoneError();
  }
  return `+${digits}`;
}

/** Pays de lancement d'un numéro normalisé, ou 'OTHER' (diaspora). */
export function countryOfPhone(phone: string): LaunchCountry | 'OTHER' {
  for (const [country, rule] of Object.entries(COUNTRY_RULES)) {
    if (phone.startsWith(`+${rule.dialCode}`)) {
      return country as LaunchCountry;
    }
  }
  return 'OTHER';
}

export function isLaunchCountry(country: string): country is LaunchCountry {
  return country in COUNTRY_RULES;
}
