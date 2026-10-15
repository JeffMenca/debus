import { formatDpi, formatNit, signedQuetzales } from './formats';

describe('profile and movement formats', () => {
  it('shows the NIT with its check digit apart and the DPI in its three groups', () => {
    expect(formatNit('45218376')).toBe('4521837-6');
    expect(formatNit('1234567K')).toBe('1234567-K');
    expect(formatDpi('2734519200901')).toBe('2734 51920 0901');
    expect(formatDpi('123')).toBe('123');
  });

  it('signs a movement amount the way people read it', () => {
    expect(signedQuetzales(300)).toMatch(/^\+ Q\s?300\.00$/);
    expect(signedQuetzales(-170)).toMatch(/^− Q\s?170\.00$/);
  });
});
