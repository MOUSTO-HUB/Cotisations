import {
  assertSwappable,
  collectedForRound,
  isDefaulter,
  roundStatus,
  TontineRuleError,
  turnsFromOrder,
} from './tontine-rounds';

const due = (
  amountPaid: bigint,
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'EXEMPT' = amountPaid >= 100n
    ? 'PAID'
    : amountPaid > 0n
      ? 'PARTIAL'
      : 'PENDING',
) => ({ amountDue: 100n, amountPaid, status });

describe('roundStatus (RG-T2)', () => {
  const base = { dueDate: '2027-03-05', paidOutAt: null };

  it('à venir tant que la date n’est pas arrivée et que personne n’a payé', () => {
    expect(
      roundStatus({ ...base, dues: [due(0n), due(0n)] }, '2027-03-01'),
    ).toBe('UPCOMING');
  });

  it('en collecte dès un premier versement ou à la date du tour', () => {
    expect(
      roundStatus({ ...base, dues: [due(100n), due(0n)] }, '2027-03-01'),
    ).toBe('COLLECTING');
    expect(
      roundStatus({ ...base, dues: [due(0n), due(0n)] }, '2027-03-05'),
    ).toBe('COLLECTING');
  });

  it('complet seulement quand toutes les parts ont payé (ou sont exonérées)', () => {
    expect(
      roundStatus({ ...base, dues: [due(100n), due(50n)] }, '2027-03-10'),
    ).toBe('COLLECTING');
    expect(
      roundStatus(
        { ...base, dues: [due(100n), due(0n, 'EXEMPT')] },
        '2027-03-10',
      ),
    ).toBe('COMPLETE');
  });

  it('pot versé une fois le versement déclaré', () => {
    expect(
      roundStatus(
        { ...base, paidOutAt: new Date(), dues: [due(100n), due(100n)] },
        '2027-03-10',
      ),
    ).toBe('PAID_OUT');
  });

  it('montant collecté du tour', () => {
    expect(collectedForRound([due(100n), due(40n)])).toBe(140n);
  });
});

describe('turnsFromOrder (ordre fixé)', () => {
  it('attribue les tours dans l’ordre donné', () => {
    expect([...turnsFromOrder(['a', 'b', 'c'], ['c', 'a', 'b'])]).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ]);
  });

  it.each([[['a', 'b']], [['a', 'a', 'b']], [['a', 'b', 'x']]])(
    'refuse un ordre incomplet ou en double : %p',
    (ordered) => {
      expect(() => turnsFromOrder(['a', 'b', 'c'], ordered)).toThrow(
        TontineRuleError,
      );
    },
  );
});

describe('assertSwappable (échange de tours)', () => {
  const round = (member: string, paid = false) => ({
    paidOutAt: paid ? new Date() : null,
    beneficiaryMembershipId: member,
  });

  it('autorise deux tours non versés de bénéficiaires différents', () => {
    expect(() => assertSwappable(round('m1'), round('m2'))).not.toThrow();
  });

  it('refuse si un pot est déjà versé', () => {
    expect(() => assertSwappable(round('m1', true), round('m2'))).toThrow(
      'avant le versement',
    );
  });

  it('refuse entre deux parts du même membre', () => {
    expect(() => assertSwappable(round('m1'), round('m1'))).toThrow(
      'deux bénéficiaires différents',
    );
  });
});

describe('isDefaulter (RG-T3)', () => {
  it('défaillant = servi et en retard', () => {
    expect(isDefaulter({ hasReceivedPot: true, lateDueCount: 1 })).toBe(true);
    expect(isDefaulter({ hasReceivedPot: false, lateDueCount: 3 })).toBe(false);
    expect(isDefaulter({ hasReceivedPot: true, lateDueCount: 0 })).toBe(false);
  });
});
