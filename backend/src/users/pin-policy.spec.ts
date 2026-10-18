import { isWeakPin } from './pin-policy';

describe('isWeakPin', () => {
  it.each(['0000', '1111', '999999', '1234', '123456', '4321', '987654'])(
    'refuse %p',
    (pin) => expect(isWeakPin(pin)).toBe(true),
  );

  it.each(['1357', '2580', '120934', '9021'])('accepte %p', (pin) =>
    expect(isWeakPin(pin)).toBe(false),
  );
});
