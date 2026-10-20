import { seedEmail } from './emails';

describe('seedEmail', () => {
  it('inserts the label before the @', () => {
    expect(seedEmail('equipo@gmail.com', 'admin-xel')).toBe('equipo+admin-xel@gmail.com');
  });

  it('keeps a + tag the base already has', () => {
    expect(seedEmail('a+b@x.com', 'label')).toBe('a+b-label@x.com');
  });

  it('rejects a base without @', () => {
    expect(() => seedEmail('equipo', 'label')).toThrow('seed email base');
  });
});
