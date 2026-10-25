import { GatewayError } from '../gateway-client';
import type { FakeGateway } from './fake-gateway';
import { PASSWORD, setup } from './setup';
import { BRANCH_ID, OTHER_BRANCH_ID, addTrip, sessionOf } from './world';

const TRIP = '00000000-0000-4000-8000-0000000c0001';
const KEY = '00000000-0000-4000-8000-0000000d0001';
const FORM = {
  fullName: 'María José Aguilar Tuy',
  email: 'seed+cliente-1@debus.local',
  dpi: '2584013920101',
  phone: '55214780',
  nit: '4521369',
  address: 'Zona 1',
};
const CASHIER = sessionOf('CASHIER', '00000000-0000-4000-8000-0000000e0001', BRANCH_ID);

async function buyer(gateway: FakeGateway, funds = 1_000) {
  await gateway.request(null, 'POST', '/api/administracion/auth/signup', FORM);
  await gateway.request(null, 'POST', '/api/administracion/auth/password', {
    token: FORM.email,
    password: PASSWORD,
  });
  const session = await gateway.login(FORM.email, PASSWORD);
  if (funds > 0) {
    await gateway.request(
      session,
      'POST',
      '/api/clientes/wallet/top-ups',
      { amount: funds, paidOn: '2026-10-18' },
      undefined,
      { 'Idempotency-Key': '00000000-0000-4000-8000-0000000f0001' },
    );
  }
  return session;
}

const buy = (
  gateway: FakeGateway,
  session: Awaited<ReturnType<typeof buyer>>,
  body: object,
  key = KEY,
) =>
  gateway.request<{ status: string; ticket: { id: string } | null; amount: number }>(
    session,
    'POST',
    '/api/ventas/purchases',
    body,
    undefined,
    { 'Idempotency-Key': key },
  );
const sell = (gateway: FakeGateway, body: object, key = KEY, session = CASHIER) =>
  gateway.request<{ id: string; buyerName: string; nit: string; seats: number[] }>(
    session,
    'POST',
    '/api/ventas/counter/tickets',
    body,
    undefined,
    { 'Idempotency-Key': key },
  );
const PURCHASE = { tripId: TRIP, seats: [2, 1], paidOn: '2026-10-15' };

describe('the fake trips on sale', () => {
  it('lists the regular trips that have not left, by day, with their free seats', async () => {
    const { gateway } = setup();
    addTrip(gateway, TRIP, { hours: 24 * 5 });
    addTrip(gateway, '00000000-0000-4000-8000-0000000c0002', { hours: 24 * 10 });
    const sessionless = sessionOf('CLIENT', 'x');
    const all = await gateway.request<{ items: { tripId: string; freeSeats: number }[] }>(
      sessionless,
      'GET',
      '/api/ventas/trips',
    );
    expect(all.items.map((trip) => trip.tripId)).toEqual([
      TRIP,
      '00000000-0000-4000-8000-0000000c0002',
    ]);
    const day = new Date(gateway.now().getTime() + 24 * 5 * 3_600_000 - 6 * 3_600_000)
      .toISOString()
      .slice(0, 10);
    const one = await gateway.request<{ items: unknown[]; total: number }>(
      sessionless,
      'GET',
      `/api/ventas/trips?from=${day}&to=${day}`,
    );
    expect(one.total).toBe(1);
    expect(all.items[0]?.freeSeats).toBe(44);
  });
});

describe('the fake online purchase', () => {
  it('charges the wallet, confirms the ticket and takes the seats', async () => {
    const { gateway } = setup();
    addTrip(gateway, TRIP, { price: 85 });
    const session = await buyer(gateway);
    const purchase = await buy(gateway, session, PURCHASE);
    expect(purchase).toMatchObject({ status: 'CONFIRMED', amount: 170 });
    expect(gateway.clients.balanceOf(session.user.id)).toBe(830);
    const trips = await gateway.request<{ items: { freeSeats: number }[] }>(
      session,
      'GET',
      '/api/ventas/trips',
    );
    expect(trips.items[0]?.freeSeats).toBe(42);
  });

  it('answers the same for the same key, without charging again', async () => {
    const { gateway } = setup();
    addTrip(gateway, TRIP);
    const session = await buyer(gateway);
    await buy(gateway, session, PURCHASE);
    await buy(gateway, session, { ...PURCHASE, paidOn: '2026-10-19', seats: [1, 2] });
    expect(gateway.clients.balanceOf(session.user.id)).toBe(830);
  });

  it('refuses the same key for other seats', async () => {
    const { gateway } = setup();
    addTrip(gateway, TRIP);
    const session = await buyer(gateway);
    await buy(gateway, session, PURCHASE);
    await expect(buy(gateway, session, { ...PURCHASE, seats: [5] })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('refuses a seat somebody else holds', async () => {
    const { gateway } = setup();
    addTrip(gateway, TRIP);
    const session = await buyer(gateway);
    gateway.sales.occupy(TRIP, [2]);
    await expect(buy(gateway, session, PURCHASE)).rejects.toMatchObject({ status: 409 });
    expect(gateway.clients.balanceOf(session.user.id)).toBe(1_000);
  });

  it('frees the seats and records the failure when the wallet is short', async () => {
    const { gateway } = setup();
    addTrip(gateway, TRIP);
    const session = await buyer(gateway, 100);
    await expect(buy(gateway, session, PURCHASE)).rejects.toMatchObject({ status: 422 });
    await expect(
      gateway.request(session, 'GET', `/api/ventas/purchases/${KEY}`),
    ).resolves.toMatchObject({ status: 'FAILED', failure: 'INSUFFICIENT_BALANCE', ticket: null });
    await expect(
      buy(gateway, session, { ...PURCHASE, seats: [9] }, '00000000-0000-4000-8000-0000000d0002'),
    ).resolves.toMatchObject({ status: 'CONFIRMED' });
  });

  it('waits for the account of the buyer when it is not ready', async () => {
    const { gateway } = setup();
    addTrip(gateway, TRIP);
    await expect(buy(gateway, sessionOf('CLIENT', 'nobody'), PURCHASE)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('Estamos terminando de preparar tu cuenta'),
    });
  });

  it('holds a doubtful purchase until it is read enough times', async () => {
    const { gateway } = setup();
    addTrip(gateway, TRIP);
    const session = await buyer(gateway);
    gateway.sales.leaveNextPending(2);
    expect(await buy(gateway, session, PURCHASE)).toMatchObject({
      status: 'PENDING',
      ticket: null,
    });
    const read = () =>
      gateway.request<{ status: string }>(session, 'GET', `/api/ventas/purchases/${KEY}`);
    expect((await read()).status).toBe('PENDING');
    expect((await read()).status).toBe('CONFIRMED');
    expect(gateway.clients.balanceOf(session.user.id)).toBe(830);
  });

  it('does not show a purchase to somebody else', async () => {
    const { gateway } = setup();
    addTrip(gateway, TRIP);
    const session = await buyer(gateway);
    await buy(gateway, session, PURCHASE);
    await expect(
      gateway.request(sessionOf('CLIENT', 'other'), 'GET', `/api/ventas/purchases/${KEY}`),
    ).rejects.toBeInstanceOf(GatewayError);
  });

  it('lists the tickets of the client, newest departure last, with the next one', async () => {
    const { gateway } = setup();
    addTrip(gateway, TRIP, { hours: 24 * 6 });
    addTrip(gateway, '00000000-0000-4000-8000-0000000c0002', { hours: 24 * 5 });
    const session = await buyer(gateway);
    await buy(gateway, session, PURCHASE);
    await buy(
      gateway,
      session,
      { tripId: '00000000-0000-4000-8000-0000000c0002', seats: [3], paidOn: '2026-10-15' },
      '00000000-0000-4000-8000-0000000d0002',
    );
    const history = await gateway.request<{
      items: { tripId: string }[];
      summary: { next: { tripId: string } };
    }>(session, 'GET', '/api/ventas/tickets');
    expect(history.items.map((ticket) => ticket.tripId)).toEqual([
      '00000000-0000-4000-8000-0000000c0002',
      TRIP,
    ]);
    expect(history.summary.next.tripId).toBe('00000000-0000-4000-8000-0000000c0002');
  });
});

describe('the fake counter sale', () => {
  it('sells for cash to a walk-in and takes the seats', async () => {
    const { gateway } = setup();
    addTrip(gateway, TRIP);
    const ticket = await sell(gateway, { tripId: TRIP, seats: [21, 22], paidOn: '2026-10-15' });
    expect(ticket).toMatchObject({ nit: 'CF', buyerName: 'Consumidor final' });
    await expect(
      sell(
        gateway,
        { tripId: TRIP, seats: [22], paidOn: '2026-10-15' },
        '00000000-0000-4000-8000-0000000d0003',
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('answers the same ticket for the same key, even with another date', async () => {
    const { gateway } = setup();
    addTrip(gateway, TRIP);
    const first = await sell(gateway, { tripId: TRIP, seats: [21], paidOn: '2026-10-15' });
    const again = await sell(gateway, { tripId: TRIP, seats: [21], paidOn: '2026-10-22' });
    expect(again.id).toBe(first.id);
    await expect(
      sell(gateway, { tripId: TRIP, seats: [30], paidOn: '2026-10-15' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('sells only trips that leave from the branch of the seller', async () => {
    const { gateway } = setup();
    addTrip(gateway, TRIP, { branchId: OTHER_BRANCH_ID });
    await expect(
      sell(gateway, { tripId: TRIP, seats: [21], paidOn: '2026-10-15' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('links the sale to the client whose NIT it carries', async () => {
    const { gateway } = setup();
    addTrip(gateway, TRIP);
    const session = await buyer(gateway);
    const ticket = await sell(gateway, {
      tripId: TRIP,
      seats: [21],
      paidOn: '2026-10-15',
      nit: '4521369',
    });
    expect(ticket.buyerName).toBe(FORM.fullName);
    const history = await gateway.request<{ items: { id: string; channel: string }[] }>(
      session,
      'GET',
      '/api/ventas/tickets',
    );
    expect(history.items).toEqual([expect.objectContaining({ id: ticket.id, channel: 'COUNTER' })]);
  });

  it('keeps the name the cashier wrote', async () => {
    const { gateway } = setup();
    addTrip(gateway, TRIP);
    const ticket = await sell(gateway, {
      tripId: TRIP,
      seats: [21],
      paidOn: '2026-10-15',
      buyerName: 'Elvira Santizo Xol',
    });
    expect(ticket.buyerName).toBe('Elvira Santizo Xol');
  });
});
