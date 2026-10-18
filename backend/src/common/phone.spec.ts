import { InvalidPhoneError, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['620 00 00 00', '+224620000000'],
    ['620-00-00-00', '+224620000000'],
    ['+224 620 00 00 00', '+224620000000'],
    ['00224620000000', '+224620000000'],
    ['224620000000', '+224620000000'],
    ['+221 77 123 45 67', '+221771234567'],
    ['+225 07 07 12 34 56', '+2250707123456'],
    ['+33 6 12 34 56 78', '+33612345678'],
    ['0033612345678', '+33612345678'],
  ])('normalise %p en %p (pays par défaut : Guinée)', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('utilise le pays par défaut de l’utilisateur', () => {
    expect(normalizePhone('77 123 45 67', 'SN')).toBe('+221771234567');
    expect(normalizePhone('07 07 12 34 56', 'CI')).toBe('+2250707123456');
  });

  it.each([
    '',
    'abc',
    '62000000', // 8 chiffres en Guinée
    '6200000000', // 10 chiffres en Guinée
    '+224 62000000', // indicatif guinéen, longueur fausse
    '+225 07 07 12 34', // indicatif ivoirien, longueur fausse
    '+1234',
  ])('refuse %p', (input) => {
    expect(() => normalizePhone(input)).toThrow(InvalidPhoneError);
  });
});
