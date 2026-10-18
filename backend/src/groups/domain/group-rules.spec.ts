import {
  needsSecondApproval,
  penaltyFor,
  readGroupRules,
  serializeGroupRules,
} from './group-rules';

describe('readGroupRules', () => {
  it('valeurs par défaut selon la devise (section 5)', () => {
    expect(readGroupRules({}, 'GNF')).toEqual({
      graceDays: 3,
      expenseApprovalThreshold: 750_000n,
      penaltyMode: 'NONE',
      penaltyValue: 0n,
      lateAlertThreshold: 3,
    });
    expect(readGroupRules(null, 'XOF').expenseApprovalThreshold).toBe(50_000n);
  });

  it('lit les règles enregistrées par le groupe', () => {
    expect(
      readGroupRules(
        {
          graceDays: 7,
          expenseApprovalThreshold: '1000000',
          penaltyMode: 'PERCENT',
          penaltyValue: '10',
          lateAlertThreshold: 2,
        },
        'GNF',
      ),
    ).toEqual({
      graceDays: 7,
      expenseApprovalThreshold: 1_000_000n,
      penaltyMode: 'PERCENT',
      penaltyValue: 10n,
      lateAlertThreshold: 2,
    });
  });

  it('ignore une valeur stockée invalide', () => {
    expect(
      readGroupRules(
        {
          graceDays: -2,
          expenseApprovalThreshold: '12.5',
          penaltyMode: 'TRIPLE',
          lateAlertThreshold: 0,
        },
        'GNF',
      ),
    ).toEqual({
      graceDays: 3,
      expenseApprovalThreshold: 750_000n,
      penaltyMode: 'NONE',
      penaltyValue: 0n,
      lateAlertThreshold: 3,
    });
  });

  it('sérialise les montants en chaîne', () => {
    expect(
      serializeGroupRules({
        graceDays: 5,
        expenseApprovalThreshold: 10n,
        penaltyMode: 'FIXED',
        penaltyValue: 5_000n,
        lateAlertThreshold: 4,
      }),
    ).toEqual({
      graceDays: 5,
      expenseApprovalThreshold: '10',
      penaltyMode: 'FIXED',
      penaltyValue: '5000',
      lateAlertThreshold: 4,
    });
  });
});

describe('needsSecondApproval (RG-D1)', () => {
  const rules = { expenseApprovalThreshold: 750_000n };

  it('le seuil lui-même ne demande pas de second validateur', () => {
    expect(needsSecondApproval(750_000n, rules)).toBe(false);
  });

  it('au-delà du seuil, un second validateur est exigé', () => {
    expect(needsSecondApproval(750_001n, rules)).toBe(true);
  });
});

describe('penaltyFor (RG-P2)', () => {
  it('aucune pénalité par défaut', () => {
    expect(penaltyFor(50_000n, { penaltyMode: 'NONE', penaltyValue: 0n })).toBe(
      0n,
    );
  });

  it('montant fixe', () => {
    expect(
      penaltyFor(50_000n, { penaltyMode: 'FIXED', penaltyValue: 5_000n }),
    ).toBe(5_000n);
  });

  it('pourcentage de l’échéance, arrondi à l’unité inférieure, au moins 1', () => {
    expect(
      penaltyFor(50_000n, { penaltyMode: 'PERCENT', penaltyValue: 10n }),
    ).toBe(5_000n);
    expect(penaltyFor(33n, { penaltyMode: 'PERCENT', penaltyValue: 10n })).toBe(
      3n,
    );
    expect(penaltyFor(5n, { penaltyMode: 'PERCENT', penaltyValue: 10n })).toBe(
      1n,
    );
  });
});
