import { SEED_CLIENTS } from '../clients-catalog';
import { GatewayError } from '../gateway-client';
import { ACCOUNT_PENDING } from '../testing/fake-clients';
import { setup } from '../testing/setup';
import { clientSession } from './client-accounts';
import { ensureBalance, ensureInitialTopUps, topUpsMade } from './client-wallet';

const CLIENT = SEED_CLIENTS[0]!; // tops up 500 and then 300
const EMAIL = 'seed+cliente-1@debus.local';

async function ready() {
  const { gateway, ctx } = setup();
  const session = await clientSession(ctx, CLIENT);
  const balance = async () =>
    (await gateway.request<{ balance: number }>(session, 'GET', '/api/clientes/wallet')).balance;
  return { gateway, ctx, session, balance };
}

describe('ensureInitialTopUps', () => {
  it('makes the top-ups of the client and nothing more on a second run', async () => {
    const { gateway, ctx, session, balance } = await ready();
    expect(await ensureInitialTopUps(ctx, CLIENT, session)).toEqual({ created: 2, existing: 0 });
    expect(await balance()).toBe(800);
    expect(await ensureInitialTopUps(ctx, CLIENT, session)).toEqual({ created: 0, existing: 2 });
    expect(gateway.count('POST', /wallet\/top-ups$/)).toBe(2);
    expect(await balance()).toBe(800);
  });

  it('dates each top-up in the past 14 days and sends a key that is the same every run', async () => {
    const { gateway, ctx, session } = await ready();
    await ensureInitialTopUps(ctx, CLIENT, session);
    const sent = gateway.requests.filter((request) => request.path.endsWith('/top-ups'));
    for (const request of sent) {
      const { paidOn } = request.body as { paidOn: string };
      expect(paidOn <= ctx.today && paidOn >= '2026-10-06').toBe(true);
      expect(request.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(new Set(sent.map((request) => request.headers['Idempotency-Key'])).size).toBe(2);
  });

  it('only makes the ones that are missing after a run that stopped halfway', async () => {
    const { gateway, ctx, session, balance } = await ready();
    await ensureInitialTopUps(ctx, { ...CLIENT, topUps: [500] }, session);
    expect(await ensureInitialTopUps(ctx, CLIENT, session)).toEqual({ created: 1, existing: 1 });
    expect(gateway.count('POST', /wallet\/top-ups$/)).toBe(2);
    expect(await balance()).toBe(800);
  });

  it('waits for the wallet, which is created by an event', async () => {
    const { gateway, ctx, session, balance } = await ready();
    gateway.failNext(/wallet/, new GatewayError(404, ACCOUNT_PENDING), 3);
    await ensureInitialTopUps(ctx, CLIENT, session);
    expect(await balance()).toBe(800);
  });
});

describe('topUpsMade', () => {
  it('counts the top-ups, not the other movements', async () => {
    const { ctx, session } = await ready();
    expect(await topUpsMade(ctx, session)).toBe(0);
    await ensureInitialTopUps(ctx, CLIENT, session);
    expect(await topUpsMade(ctx, session)).toBe(2);
  });
});

describe('ensureBalance', () => {
  it('does not top up when the balance covers it', async () => {
    const { gateway, ctx, session } = await ready();
    await ensureInitialTopUps(ctx, CLIENT, session);
    gateway.requests.length = 0;
    expect(await ensureBalance(ctx, session, EMAIL, 800)).toBe(false);
    expect(gateway.count('POST', /top-ups$/)).toBe(0);
  });

  it('tops up the next hundred above what is missing, dated today', async () => {
    const { gateway, ctx, session, balance } = await ready();
    await ensureInitialTopUps(ctx, CLIENT, session);
    expect(await ensureBalance(ctx, session, EMAIL, 1_030.5)).toBe(true);
    expect(await balance()).toBe(1_100);
    const last = gateway.requests.filter((request) => request.path.endsWith('/top-ups')).at(-1);
    expect(last?.body).toEqual({ amount: 300, paidOn: ctx.today });
  });

  it('uses the next key, so a client topped up twice does not repeat the first key', async () => {
    const { gateway, ctx, session } = await ready();
    await ensureBalance(ctx, session, EMAIL, 100);
    await ensureBalance(ctx, session, EMAIL, 300);
    const keys = gateway.requests
      .filter((request) => request.path.endsWith('/top-ups'))
      .map((request) => request.headers['Idempotency-Key']);
    expect(new Set(keys).size).toBe(2);
  });
});
