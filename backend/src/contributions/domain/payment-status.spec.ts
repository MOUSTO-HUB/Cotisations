import { displayedPaymentStatus } from './payment-status';

describe('displayedPaymentStatus (RG-C1)', () => {
  const recorded = new Date('2027-01-01T10:00:00Z');

  it('reste en attente pendant 7 jours', () => {
    expect(
      displayedPaymentStatus(
        'PENDING_CONFIRMATION',
        recorded,
        new Date('2027-01-08T09:59:00Z'),
      ),
    ).toBe('PENDING_CONFIRMATION');
  });

  it('devient confirmé sans contestation après 7 jours', () => {
    expect(
      displayedPaymentStatus(
        'PENDING_CONFIRMATION',
        recorded,
        new Date('2027-01-08T10:00:00Z'),
      ),
    ).toBe('CONFIRMED');
  });

  it('ne touche pas un paiement contesté ou annulé', () => {
    const later = new Date('2027-03-01T00:00:00Z');
    expect(displayedPaymentStatus('DISPUTED', recorded, later)).toBe(
      'DISPUTED',
    );
    expect(displayedPaymentStatus('REVERSED', recorded, later)).toBe(
      'REVERSED',
    );
  });
});
