/**
 * Refuse les codes PIN trop faciles à deviner : chiffres tous identiques
 * (0000, 111111) ou suite croissante / décroissante (1234, 987654).
 */
export function isWeakPin(pin: string): boolean {
  const digits = [...pin].map(Number);
  const allSame = digits.every((d) => d === digits[0]);
  const ascending = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1);
  const descending = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1);
  return allSame || ascending || descending;
}
