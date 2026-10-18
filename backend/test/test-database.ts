/**
 * Base dédiée aux tests e2e, distincte de la base de développement.
 * Elle n'est jamais effacée : chaque test crée ses propres données.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://cotisations:cotisations@localhost:5433/cotisations_test?schema=public';
