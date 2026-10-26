import { GatewayError } from '../gateway-client';
import type { FakeGateway } from './fake-gateway';
import { NOW, PASSWORD, setup } from './setup';

const FORM = {
  fullName: 'María José Aguilar Tuy',
  email: 'seed+cliente-1@debus.local',
  dpi: '2584013920101',
  phone: '55214780',
  nit: '4521369',
  address: 'Zona 1',
};
const KEY = '00000000-0000-4000-8000-0000000000aa';

async function activeClient(gateway: FakeGateway) {
  await gateway.request(null, 'POST', '/api/administracion/auth/signup', FORM);
  await gateway.request(null, 'POST', '/api/administracion/auth/password', {
    token: FORM.email,
    password: PASSWORD,
  });
  return gateway.login(FORM.email, PASSWORD);
}

const topUp = (
  gateway: FakeGateway,
  session: Awaited<ReturnType<typeof activeClient>>,
  body: object,
  key = KEY,
) =>
  gateway.request(session, 'POST', '/api/clientes/wallet/top-ups', body, undefined, {
    'Idempotency-Key': key,
  });

describe('the fake accounts of clients', () => {
  it('leaves a signup pending and its link in the mailbox until the password is set', async () => {
    const { gateway } = setup();
    await gateway.request(null, 'POST', '/api/administracion/auth/signup', FORM);
    expect(gateway.forgot).toContain(FORM.email);
    await expect(gateway.login(FORM.email, PASSWORD)).rejects.toMatchObject({ status: 401 });
    const session = await activeClient(gateway);
    expect(session.user).toMatchObject({ role: 'CLIENT', email: FORM.email, branchId: null });
  });

  it('keeps the profile of the signup', async () => {
    const { gateway } = setup();
    const session = await activeClient(gateway);
    await expect(gateway.request(session, 'GET', '/api/clientes/profile')).resolves.toMatchObject({
      nit: '4521369',
      dpi: '2584013920101',
    });
  });

  it('does not let a second signup change an active account', async () => {
    const { gateway } = setup();
    await activeClient(gateway);
    await gateway.request(null, 'POST', '/api/administracion/auth/signup', {
      ...FORM,
      fullName: 'Otra',
    });
    expect(gateway.users.filter((user) => user.email === FORM.email)).toHaveLength(1);
    expect(gateway.users.find((user) => user.email === FORM.email)?.fullName).toBe(FORM.fullName);
  });
});

describe('the fake wallet', () => {
  it('starts empty and credits a top-up once per key', async () => {
    const { gateway } = setup();
    const session = await activeClient(gateway);
    expect(await gateway.request(session, 'GET', '/api/clientes/wallet')).toMatchObject({
      balance: 0,
    });
    await topUp(gateway, session, { amount: 250, paidOn: '2026-10-18' });
    await topUp(gateway, session, { amount: 250, paidOn: '2026-10-18' });
    expect(await gateway.request(session, 'GET', '/api/clientes/wallet')).toMatchObject({
      balance: 250,
    });
  });

  it('refuses the same key with another body, as the real wallet does', async () => {
    const { gateway } = setup();
    const session = await activeClient(gateway);
    await topUp(gateway, session, { amount: 250, paidOn: '2026-10-18' });
    await expect(
      topUp(gateway, session, { amount: 250, paidOn: '2026-10-19' }),
    ).rejects.toMatchObject({
      status: 409,
    });
  });

  it('asks for a key', async () => {
    const { gateway } = setup();
    const session = await activeClient(gateway);
    await expect(
      gateway.request(session, 'POST', '/api/clientes/wallet/top-ups', {
        amount: 5,
        paidOn: '2026-10-18',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('lists the movements newest first, filtered by kind', async () => {
    const { gateway } = setup();
    const session = await activeClient(gateway);
    await topUp(
      gateway,
      session,
      { amount: 100, paidOn: '2026-10-17' },
      '00000000-0000-4000-8000-0000000000a1',
    );
    await topUp(
      gateway,
      session,
      { amount: 200, paidOn: '2026-10-18' },
      '00000000-0000-4000-8000-0000000000a2',
    );
    const all = await gateway.request<{
      items: { amount: number; balanceAfter: number }[];
      total: number;
    }>(session, 'GET', '/api/clientes/wallet/movements?kind=all');
    expect(all.items.map((movement) => movement.amount)).toEqual([200, 100]);
    expect(all.items[0]?.balanceAfter).toBe(300);
    const tickets = await gateway.request<{ total: number }>(
      session,
      'GET',
      '/api/clientes/wallet/movements?kind=TICKET',
    );
    expect(tickets.total).toBe(0);
  });

  it('answers that the account is being prepared until the failure given to failNext is used up', async () => {
    const { gateway } = setup();
    const session = await activeClient(gateway);
    gateway.failNext(
      /GET \/api\/clientes\/wallet$/,
      new GatewayError(404, 'Estamos preparando tu cuenta. Vuelve a intentar en unos segundos.'),
    );
    await expect(gateway.request(session, 'GET', '/api/clientes/wallet')).rejects.toMatchObject({
      status: 404,
    });
    await expect(gateway.request(session, 'GET', '/api/clientes/wallet')).resolves.toMatchObject({
      balance: 0,
    });
  });

  it('keeps the same clock as the rest of the fake', async () => {
    const { gateway } = setup(NOW);
    const session = await activeClient(gateway);
    const wallet = await topUp(gateway, session, { amount: 10, paidOn: '2026-10-18' });
    expect(wallet).toMatchObject({ updatedAt: NOW.toISOString() });
  });
});
