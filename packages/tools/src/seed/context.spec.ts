import { createContext } from './context';
import type { Gateway, Session } from './gateway-client';
import type { Mailbox } from './mailbox';

const base = {
  client: {} as Gateway,
  mailbox: {} as Mailbox,
  admin: {} as Session,
  emailBase: 'seed@debus.local',
  password: 'x',
  today: '2026-10-19',
};

describe('createContext', () => {
  it('fills in the defaults and empty registries', () => {
    const ctx = createContext(base);
    expect(ctx.daysAhead).toBe(7);
    expect(ctx.retry).toEqual({});
    expect(ctx.branchIds.size).toBe(0);
    expect(ctx.branchAdmins.size).toBe(0);
    expect(ctx.registeredDrivers.size).toBe(0);
    expect(ctx.now()).toBeInstanceOf(Date);
    expect(() => ctx.log('quiet')).not.toThrow();
  });

  it('keeps what it is given', () => {
    const log = jest.fn();
    const now = () => new Date('2026-01-01T00:00:00.000Z');
    const ctx = createContext({ ...base, daysAhead: 3, retry: { delayMs: 0 }, now, log });
    expect(ctx.daysAhead).toBe(3);
    expect(ctx.retry).toEqual({ delayMs: 0 });
    expect(ctx.now()).toEqual(now());
    ctx.log('hello');
    expect(log).toHaveBeenCalledWith('hello');
  });
});
