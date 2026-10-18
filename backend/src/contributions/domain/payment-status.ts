import type { PaymentStatus } from '@prisma/client';

/** RG-C1 : sans contestation sous 7 jours, un paiement en espèces est confirmé. */
export const CONFIRMATION_WINDOW_MS = 7 * 24 * 60 * 60_000;

export function isConfirmationWindowOpen(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() < CONFIRMATION_WINDOW_MS;
}

/**
 * Statut affiché d'un paiement : « en attente » devient « confirmé »
 * automatiquement une fois le délai de 7 jours écoulé.
 */
export function displayedPaymentStatus(
  status: PaymentStatus,
  createdAt: Date,
  now: Date,
): PaymentStatus {
  if (
    status === 'PENDING_CONFIRMATION' &&
    !isConfirmationWindowOpen(createdAt, now)
  ) {
    return 'CONFIRMED';
  }
  return status;
}
