import { signupRequestSchema } from '@debus/contracts';
import { SEED_CLIENTS, clientEmail, seedClient } from './clients-catalog';

describe('SEED_CLIENTS', () => {
  it('has twelve clients numbered from 1', () => {
    expect(SEED_CLIENTS.map((client) => client.number)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
  });

  it('gives every client what the signup form asks for', () => {
    for (const client of SEED_CLIENTS) {
      const { number, topUps, ...form } = client;
      const parsed = signupRequestSchema.safeParse({ ...form, email: 'cliente@debus.test' });
      expect({ number, ok: parsed.success }).toEqual({ number, ok: true });
      expect(topUps.length).toBeGreaterThanOrEqual(1);
      expect(topUps.length).toBeLessThanOrEqual(3);
    }
  });

  it('never repeats a DPI, a NIT or a name, since each is a different person', () => {
    for (const field of ['dpi', 'nit', 'fullName'] as const) {
      const values = SEED_CLIENTS.map((client) => client[field]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('tops up enough for the client to buy, with whole amounts the API accepts', () => {
    for (const { topUps } of SEED_CLIENTS) {
      for (const amount of topUps) {
        expect(Number.isInteger(amount)).toBe(true);
        expect(amount).toBeGreaterThanOrEqual(100);
        expect(amount).toBeLessThanOrEqual(800);
      }
    }
  });
});

describe('clientEmail', () => {
  it('tags the team inbox with the client number', () => {
    expect(clientEmail('seed@debus.local', 3)).toBe('seed+cliente-3@debus.local');
    expect(clientEmail('equipo@gmail.com', 12)).toBe('equipo+cliente-12@gmail.com');
  });
});

describe('seedClient', () => {
  it('finds a client by number and refuses one the seed does not have', () => {
    expect(seedClient(4).fullName).toBe('Carlos Enrique Ixcot Batz');
    expect(() => seedClient(99)).toThrow('The seed has no client number 99');
  });
});
