import {
  allocatePayment,
  ContributionRuleError,
  displayedStatus,
  generateDueDates,
  MAX_OCCURRENCES,
  storedStatus,
} from './contribution-rules';

describe('generateDueDates', () => {
  it('cotisation ponctuelle (décès, mariage) : une seule échéance', () => {
    expect(generateDueDates({ startDate: '2027-03-10' })).toEqual([
      '2027-03-10',
    ]);
  });

  it('cotisation mensuelle sur un an : 12 échéances', () => {
    const dates = generateDueDates({
      startDate: '2027-01-05',
      endDate: '2027-12-31',
      periodicity: 'MONTHLY',
    });
    expect(dates).toHaveLength(12);
    expect(dates.at(0)).toBe('2027-01-05');
    expect(dates.at(-1)).toBe('2027-12-05');
  });

  it('inclut la date de fin si elle tombe sur une échéance', () => {
    expect(
      generateDueDates({
        startDate: '2027-01-01',
        endDate: '2027-01-15',
        periodicity: 'WEEKLY',
      }),
    ).toEqual(['2027-01-01', '2027-01-08', '2027-01-15']);
  });

  it('cotisation annuelle par foyer sur 3 ans', () => {
    expect(
      generateDueDates({
        startDate: '2027-01-15',
        endDate: '2029-12-31',
        periodicity: 'YEARLY',
      }),
    ).toEqual(['2027-01-15', '2028-01-15', '2029-01-15']);
  });

  it('exige une date de fin pour une cotisation récurrente', () => {
    expect(() =>
      generateDueDates({ startDate: '2027-01-01', periodicity: 'MONTHLY' }),
    ).toThrow(ContributionRuleError);
  });

  it('refuse une fin avant le début', () => {
    expect(() =>
      generateDueDates({
        startDate: '2027-02-01',
        endDate: '2027-01-01',
        periodicity: 'MONTHLY',
      }),
    ).toThrow('après la date de début');
  });

  it(`refuse plus de ${MAX_OCCURRENCES} échéances`, () => {
    expect(() =>
      generateDueDates({
        startDate: '2027-01-01',
        endDate: '2029-01-01',
        periodicity: 'DAILY',
      }),
    ).toThrow('Trop d');
  });
});

describe('allocatePayment (RG-C2)', () => {
  const dues = [
    { id: 'jan', amountDue: 50_000n, amountPaid: 50_000n },
    { id: 'fev', amountDue: 50_000n, amountPaid: 20_000n },
    { id: 'mar', amountDue: 50_000n, amountPaid: 0n },
    { id: 'avr', amountDue: 50_000n, amountPaid: 0n },
  ];

  it('impute un paiement partiel à l’échéance la plus ancienne non soldée', () => {
    expect(allocatePayment(10_000n, dues)).toEqual([
      { dueId: 'fev', amount: 10_000n },
    ]);
  });

  it('solde l’ancienne échéance puis passe à la suivante', () => {
    expect(allocatePayment(60_000n, dues)).toEqual([
      { dueId: 'fev', amount: 30_000n },
      { dueId: 'mar', amount: 30_000n },
    ]);
  });

  it('permet de payer plusieurs échéances d’avance', () => {
    expect(allocatePayment(130_000n, dues)).toEqual([
      { dueId: 'fev', amount: 30_000n },
      { dueId: 'mar', amount: 50_000n },
      { dueId: 'avr', amount: 50_000n },
    ]);
  });

  it('refuse un montant supérieur au reste à payer', () => {
    expect(() => allocatePayment(130_001n, dues)).toThrow(
      'dépasse le reste à payer (130000)',
    );
  });

  it('refuse un montant nul ou négatif', () => {
    expect(() => allocatePayment(0n, dues)).toThrow(ContributionRuleError);
  });
});

describe('statuts', () => {
  it('statut stocké selon le montant payé', () => {
    expect(storedStatus(50_000n, 0n)).toBe('PENDING');
    expect(storedStatus(50_000n, 1n)).toBe('PARTIAL');
    expect(storedStatus(50_000n, 50_000n)).toBe('PAID');
  });

  it('RG-P1 : en retard seulement après le délai de grâce de 3 jours', () => {
    const due = { status: 'PENDING' as const, dueDate: '2027-01-05' };
    expect(displayedStatus(due, '2027-01-05')).toBe('PENDING');
    expect(displayedStatus(due, '2027-01-08')).toBe('PENDING');
    expect(displayedStatus(due, '2027-01-09')).toBe('LATE');
    expect(displayedStatus(due, '2027-01-09', 7)).toBe('PENDING');
  });

  it('une échéance payée ou exonérée n’est jamais en retard', () => {
    expect(
      displayedStatus({ status: 'PAID', dueDate: '2020-01-01' }, '2027-01-01'),
    ).toBe('PAID');
    expect(
      displayedStatus(
        { status: 'EXEMPT', dueDate: '2020-01-01' },
        '2027-01-01',
      ),
    ).toBe('EXEMPT');
  });
});
