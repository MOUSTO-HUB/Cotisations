import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';

function scrypt(password: string, salt: Buffer, keylen: number) {
  return new Promise<Buffer>((resolve, reject) =>
    scryptCallback(password, salt, keylen, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

const KEY_LENGTH = 32;

/**
 * Hache un secret court (code OTP, code PIN) avec scrypt et un sel aléatoire.
 * Format stocké : `scrypt$<sel base64>$<empreinte base64>`.
 */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(secret, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifySecret(
  secret: string,
  stored: string,
): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(
    secret,
    Buffer.from(saltB64, 'base64'),
    KEY_LENGTH,
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Empreinte rapide d'un jeton à forte entropie (jeton de session). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}
