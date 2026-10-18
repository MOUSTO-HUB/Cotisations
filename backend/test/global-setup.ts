import { execSync } from 'node:child_process';
import { TEST_DATABASE_URL } from './test-database';

/**
 * Crée la base de test si besoin et applique les migrations, sans rien effacer.
 * Les tests utilisent des données uniques à chaque lancement (numéros aléatoires).
 */
export default function globalSetup() {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'ignore',
  });
}
