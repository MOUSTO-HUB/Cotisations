import type { User } from '@prisma/client';

/** Données d'un utilisateur renvoyées par l'API (jamais le hachage du PIN). */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    phone: user.phone,
    fullName: user.fullName,
    language: user.language,
    country: user.country,
    mobileMoneyNumber: user.mobileMoneyNumber,
    hasPin: user.pinHash !== null,
  };
}
