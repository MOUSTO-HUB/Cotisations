import { addDays, fromDbDate, todayIn, toDbDate } from './calendar';

describe('calendar', () => {
  it('ajoute des jours en changeant de mois et d’année', () => {
    expect(addDays('2027-12-30', 3)).toBe('2028-01-02');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('donne la date du jour dans le fuseau du groupe', () => {
    // 23 h 30 UTC le 31 décembre : déjà le 1er janvier à Tokyo, pas à Conakry.
    const now = new Date('2026-12-31T23:30:00Z');
    expect(todayIn('Africa/Conakry', now)).toBe('2026-12-31');
    expect(todayIn('Asia/Tokyo', now)).toBe('2027-01-01');
  });

  it('convertit sans décalage d’un jour vers et depuis la base', () => {
    expect(fromDbDate(toDbDate('2027-02-28'))).toBe('2027-02-28');
  });
});
