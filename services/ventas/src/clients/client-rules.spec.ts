import { linkableNit } from './client-rules';

describe('linkableNit', () => {
  it('links a real NIT and never the generic counter client or an empty one', () => {
    expect(linkableNit('45218376')).toBe(true);
    expect(linkableNit('CF')).toBe(false);
    expect(linkableNit(null)).toBe(false);
  });
});
