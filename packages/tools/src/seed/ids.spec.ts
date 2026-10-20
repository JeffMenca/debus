import { uuidFrom } from './ids';

describe('uuidFrom', () => {
  it('gives the same UUID for the same text and another for another text', () => {
    expect(uuidFrom('repair:bus-1:0')).toBe(uuidFrom('repair:bus-1:0'));
    expect(uuidFrom('repair:bus-1:0')).not.toBe(uuidFrom('repair:bus-1:1'));
  });

  it('is a valid UUID', () => {
    expect(uuidFrom('anything')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
