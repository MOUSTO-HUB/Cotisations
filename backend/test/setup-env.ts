import { TEST_DATABASE_URL } from './test-database';

process.env.DATABASE_URL = TEST_DATABASE_URL;
// Les tests lisent le code via le faux SMS, jamais via la réponse de l'API,
// quelle que soit la configuration du fichier .env local.
process.env.OTP_DEV_ECHO = 'false';
