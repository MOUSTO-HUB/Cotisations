import {
  needsSecondApproval,
  readGroupRules,
  serializeGroupRules,
} from './group-rules';

describe('readGroupRules', () => {
  it('valeurs par défaut selon la devise (section 5)', () => {
    expect(readGroupRules({}, 'GNF')).toEqual({
      graceDays: 3,
      expenseApprovalThreshold: 750_000n,
    });
    expect(readGroupRules(null, 'XOF').expenseApprovalThreshold).toBe(50_000n);
  });

  it('lit les règles enregistrées par le groupe', () => {
    expect(
      readGroupRules(
        { graceDays: 7, expenseApprovalThreshold: '1000000' },
        'GNF',
      ),
    ).toEqual({ graceDays: 7, expenseApprovalThreshold: 1_000_000n });
  });

  it('ignore une valeur stockée invalide', () => {
    expect(
      readGroupRules(
        { graceDays: -2, expenseApprovalThreshold: '12.5' },
        'GNF',
      ),
    ).toEqual({ graceDays: 3, expenseApprovalThreshold: 750_000n });
  });

  it('sérialise les montants en chaîne', () => {
    expect(
      serializeGroupRules({ graceDays: 5, expenseApprovalThreshold: 10n }),
    ).toEqual({ graceDays: 5, expenseApprovalThreshold: '10' });
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
