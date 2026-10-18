import { randomInt } from 'node:crypto';

/**
 * Tirage au sort de l'ordre des bénéficiaires (RG-T4).
 *
 * Le tirage est fait côté serveur avec un générateur cryptographique ;
 * l'appelant doit archiver le résultat et ne jamais relancer le tirage.
 * `random` est injectable pour les tests : il renvoie un entier dans [0, max).
 */
export function drawOrder<T>(
  participants: readonly T[],
  random: (max: number) => number = randomInt,
): T[] {
  const order = [...participants];
  // Mélange de Fisher-Yates : chaque permutation a la même probabilité.
  for (let i = order.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
