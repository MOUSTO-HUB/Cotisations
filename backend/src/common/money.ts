/**
 * Montants : entiers dans l'unité de la devise (GNF, XOF n'ont pas de centimes).
 * Dans l'API, ils voyagent en chaînes pour ne jamais perdre de précision.
 */
export const AMOUNT_PATTERN = /^[1-9]\d{0,17}$/;
export const AMOUNT_MESSAGE =
  'Le montant doit être un entier positif, écrit en chaîne (ex. "50000").';

export function parseAmount(value: string): bigint {
  if (!AMOUNT_PATTERN.test(value)) throw new RangeError(AMOUNT_MESSAGE);
  return BigInt(value);
}
