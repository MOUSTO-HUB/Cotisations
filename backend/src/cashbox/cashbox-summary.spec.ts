import { summarizeMovements } from './cashbox-summary';

describe('summarizeMovements', () => {
  it('neutralise les contre-écritures et sépare les transferts', () => {
    const s = summarizeMovements([
      { direction: 'IN', amount: 500n, category: 'contribution' },
      { direction: 'IN', amount: 200n, category: 'donation' },
      { direction: 'OUT', amount: 200n, category: 'reversal' }, // don annulé
      { direction: 'OUT', amount: 300n, category: 'matériaux' },
      { direction: 'IN', amount: 300n, category: 'reversal' }, // dépense annulée
      { direction: 'OUT', amount: 100n, category: 'matériaux' },
      { direction: 'OUT', amount: 50n, category: 'transfer' },
    ]);
    expect(s).toEqual({
      collected: 500n,
      spent: 100n,
      transferredIn: 0n,
      transferredOut: 50n,
      balance: 350n,
    });
  });
});
