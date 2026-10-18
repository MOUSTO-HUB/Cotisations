import {
  computeTontineSchedule,
  TontineParams,
  TontineParamsError,
} from './tontine-schedule';
import { drawOrder } from './draw-order';

const base: TontineParams = {
  contributionAmount: 500_000n,
  shareCount: 12,
  periodicity: 'MONTHLY',
  startDate: '2027-01-05',
};

describe('computeTontineSchedule', () => {
  it('RG-T1 : pot = montant par part × nombre de parts (12 × 500 000 GNF)', () => {
    const s = computeTontineSchedule(base);
    expect(s.potAmount).toBe(6_000_000n);
    expect(s.roundCount).toBe(12);
    expect(s.rounds.every((r) => r.potAmount === 6_000_000n)).toBe(true);
  });

  it('mensuelle : 12 tours, du 5 janvier au 5 décembre', () => {
    const s = computeTontineSchedule(base);
    expect(s.rounds[0]).toEqual({
      number: 1,
      dueDate: '2027-01-05',
      potAmount: 6_000_000n,
    });
    expect(s.rounds[1].dueDate).toBe('2027-02-05');
    expect(s.endDate).toBe('2027-12-05');
  });

  it('quotidienne de marché : 30 membres à 10 000 GNF, pot de 300 000 GNF sur 30 jours', () => {
    const s = computeTontineSchedule({
      contributionAmount: 10_000n,
      shareCount: 30,
      periodicity: 'DAILY',
      startDate: '2027-01-30',
    });
    expect(s.potAmount).toBe(300_000n);
    expect(s.rounds[2].dueDate).toBe('2027-02-01');
    expect(s.endDate).toBe('2027-02-28');
  });

  it('hebdomadaire : un tour tous les 7 jours', () => {
    const s = computeTontineSchedule({
      ...base,
      shareCount: 4,
      periodicity: 'WEEKLY',
      startDate: '2027-12-20',
    });
    expect(s.rounds.map((r) => r.dueDate)).toEqual([
      '2027-12-20',
      '2027-12-27',
      '2028-01-03',
      '2028-01-10',
    ]);
  });

  it('annuelle : 5 membres à 2 000 000 GNF durent 5 ans', () => {
    const s = computeTontineSchedule({
      contributionAmount: 2_000_000n,
      shareCount: 5,
      periodicity: 'YEARLY',
      startDate: '2027-03-01',
    });
    expect(s.potAmount).toBe(10_000_000n);
    expect(s.endDate).toBe('2031-03-01');
  });

  it('personnalisée : tous les 15 jours', () => {
    const s = computeTontineSchedule({
      ...base,
      shareCount: 3,
      periodicity: 'CUSTOM_DAYS',
      intervalDays: 15,
      startDate: '2027-01-01',
    });
    expect(s.rounds.map((r) => r.dueDate)).toEqual([
      '2027-01-01',
      '2027-01-16',
      '2027-01-31',
    ]);
  });

  it('mensuelle commencée un 31 : garde le 31 quand le mois le permet', () => {
    const s = computeTontineSchedule({
      ...base,
      shareCount: 4,
      startDate: '2028-01-31',
    });
    expect(s.rounds.map((r) => r.dueDate)).toEqual([
      '2028-01-31',
      '2028-02-29', // année bissextile
      '2028-03-31',
      '2028-04-30',
    ]);
  });

  it('annuelle commencée un 29 février : 28 février les années non bissextiles', () => {
    const s = computeTontineSchedule({
      ...base,
      shareCount: 2,
      periodicity: 'YEARLY',
      startDate: '2028-02-29',
    });
    expect(s.endDate).toBe('2029-02-28');
  });

  it('gère des montants très élevés sans perte de précision', () => {
    const s = computeTontineSchedule({
      ...base,
      contributionAmount: 9_007_199_254_740_993n,
      shareCount: 100,
    });
    expect(s.potAmount).toBe(900_719_925_474_099_300n);
  });

  describe('validation', () => {
    it.each([
      [{ contributionAmount: 0n }, 'supérieur à zéro'],
      [{ contributionAmount: -1n }, 'supérieur à zéro'],
      [{ shareCount: 1 }, 'entre 2 et 100'],
      [{ shareCount: 101 }, 'entre 2 et 100'],
      [{ shareCount: 2.5 }, 'entre 2 et 100'],
      [{ periodicity: 'CUSTOM_DAYS' as const }, 'intervalle'],
      [{ periodicity: 'CUSTOM_DAYS' as const, intervalDays: 0 }, 'intervalle'],
      [{ startDate: '05/01/2027' }, 'AAAA-MM-JJ'],
      [{ startDate: '2027-02-30' }, "n'existe pas"],
    ])('refuse %p', (override, message) => {
      expect(() => computeTontineSchedule({ ...base, ...override })).toThrow(
        TontineParamsError,
      );
      expect(() => computeTontineSchedule({ ...base, ...override })).toThrow(
        message,
      );
    });
  });
});

describe('drawOrder (RG-T4)', () => {
  it('renvoie une permutation des participants sans modifier la liste source', () => {
    const members = [
      'Aïssatou',
      'Mamadou',
      'Fatoumata',
      'Ibrahima',
      'Kadiatou',
    ];
    const order = drawOrder(members);
    expect([...order].sort()).toEqual([...members].sort());
    expect(members).toEqual([
      'Aïssatou',
      'Mamadou',
      'Fatoumata',
      'Ibrahima',
      'Kadiatou',
    ]);
  });

  it('est déterministe avec un générateur injecté', () => {
    const alwaysZero = () => 0;
    expect(drawOrder(['A', 'B', 'C', 'D'], alwaysZero)).toEqual([
      'B',
      'C',
      'D',
      'A',
    ]);
  });
});
