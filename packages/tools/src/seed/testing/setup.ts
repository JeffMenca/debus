import { createContext, type SeedContext } from '../context';
import { FakeGateway, FakeMailbox } from './fake-gateway';

export const NOW = new Date('2026-10-19T17:00:00.000Z'); // 11:00 in Guatemala
export const TODAY = '2026-10-19';
export const BASE = 'seed@debus.local';
export const PASSWORD = 'clave-demo-1';

export function setup(now: Date = NOW, today: string = TODAY) {
  const gateway = new FakeGateway(() => now);
  const ctx: SeedContext = createContext({
    client: gateway,
    mailbox: new FakeMailbox(gateway),
    admin: gateway.systemAdmin,
    emailBase: BASE,
    password: PASSWORD,
    today,
    now: () => now,
    retry: { delayMs: 0 },
  });
  return { gateway, ctx };
}
