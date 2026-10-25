import type { Session } from '../gateway-client';
import type { FakeGateway } from './fake-gateway';
import { PASSWORD, setup } from './setup';
import { BRANCH_ID, OTHER_BRANCH_ID, addTrip, sessionOf } from './world';

const ADMIN = sessionOf('BRANCH_ADMIN', '00000000-0000-4000-8000-0000000a0001', BRANCH_ID);
const OTHER_ADMIN = sessionOf(
  'BRANCH_ADMIN',
  '00000000-0000-4000-8000-0000000a0002',
  OTHER_BRANCH_ID,
);
const FORM = {
  fullName: 'María José Aguilar Tuy',
  email: 'seed+cliente-1@debus.local',
  dpi: '2584013920101',
  phone: '55214780',
  nit: '4521369',
  address: 'Zona 1',
};
const DEPARTURE = '2026-11-10T14:00:00.000Z';
const RENTAL = {
  branchId: BRANCH_ID,
  originLabel: 'Ciudad de Guatemala',
  destinationLabel: 'Lago de Atitlán',
  departureAt: DEPARTURE,
  returnAt: '2026-11-11T02:00:00.000Z',
  passengers: 30,
  distanceKm: 120,
};
const BUS = '00000000-0000-4000-8000-0000000b00a1';
const DRIVER = '00000000-0000-4000-8000-0000000b00d1';
const ASSIGNMENT = { busId: BUS, driverId: DRIVER, estimatedArrivalAt: '2026-11-10T20:00:00.000Z' };

function world(funds = 5_000) {
  const { gateway } = setup();
  gateway.branches.push({ id: BRANCH_ID, code: 'GUA', name: 'Ciudad de Guatemala', active: true });
  gateway.buses.push({
    id: BUS,
    branchId: BRANCH_ID,
    plate: 'C100BTX',
    capacity: 40,
    active: true,
  });
  gateway.drivers.push({ id: DRIVER, branchId: BRANCH_ID, fullName: 'Chofer Uno', active: true });
  return { gateway, funds };
}

async function client(gateway: FakeGateway, funds: number): Promise<Session> {
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

// What the fake answers, as loosely as the specs below read it.
interface Answer {
  id: string;
  status: string;
  estimatedPrice: number;
  items: Answer[];
  [field: string]: unknown;
}
const ask = (
  gateway: FakeGateway,
  session: Session,
  method: string,
  path: string,
  body?: object,
  id?: string,
) =>
  gateway.request<Answer>(
    session,
    method,
    path,
    body,
    undefined,
    id ? { 'Idempotency-Key': id } : {},
  );
const pay = (gateway: FakeGateway, session: Session, id: string, paidOn = '2026-10-20') =>
  ask(gateway, session, 'POST', `/api/clientes/rentals/${id}/pay`, { paidOn }, id);

async function paidOnline(gateway: FakeGateway, funds = 5_000) {
  const session = await client(gateway, funds);
  const rental = await ask(gateway, session, 'POST', '/api/clientes/rentals', RENTAL);
  await ask(gateway, ADMIN, 'POST', `/api/clientes/branch-rentals/${rental.id}/confirm`, {
    price: 1_440,
  });
  await pay(gateway, session, rental.id);
  return { session, id: rental.id as string };
}

describe('the fake online rentals', () => {
  it('prices the request with the rate of the day and leaves it waiting for the branch', async () => {
    const { gateway, funds } = world();
    const session = await client(gateway, funds);
    const rental = await ask(gateway, session, 'POST', '/api/clientes/rentals', RENTAL);
    expect(rental).toMatchObject({
      status: 'REQUESTED',
      channel: 'ONLINE',
      estimatedPrice: 1_440,
      price: null,
    });
    const estimate = await ask(
      gateway,
      session,
      'GET',
      '/api/clientes/rentals/estimate?distanceKm=120',
    );
    expect(estimate.estimatedPrice).toBe(1_440);
  });

  it('refuses a branch that is not active', async () => {
    const { gateway, funds } = world();
    const session = await client(gateway, funds);
    await expect(
      ask(gateway, session, 'POST', '/api/clientes/rentals', {
        ...RENTAL,
        branchId: OTHER_BRANCH_ID,
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('is confirmed only by the admin of its branch and only once', async () => {
    const { gateway, funds } = world();
    const session = await client(gateway, funds);
    const { id } = await ask(gateway, session, 'POST', '/api/clientes/rentals', RENTAL);
    await expect(
      ask(gateway, OTHER_ADMIN, 'POST', `/api/clientes/branch-rentals/${id}/confirm`, {
        price: 1_000,
      }),
    ).rejects.toMatchObject({ status: 404 });
    const confirmed = await ask(
      gateway,
      ADMIN,
      'POST',
      `/api/clientes/branch-rentals/${id}/confirm`,
      { price: 1_500 },
    );
    expect(confirmed).toMatchObject({ status: 'CONFIRMED', price: 1_500 });
    await expect(
      ask(gateway, ADMIN, 'POST', `/api/clientes/branch-rentals/${id}/confirm`, { price: 1_500 }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('is paid from the wallet once, with the id as the key', async () => {
    const { gateway } = world();
    const { session, id } = await paidOnline(gateway);
    expect(gateway.clients.balanceOf(session.user.id)).toBe(3_560);
    const again = await pay(gateway, session, id);
    expect(again.status).toBe('PAID');
    expect(gateway.clients.balanceOf(session.user.id)).toBe(3_560);
    await expect(pay(gateway, session, id, '2026-10-21')).rejects.toMatchObject({ status: 409 });
    await expect(
      ask(
        gateway,
        session,
        'POST',
        `/api/clientes/rentals/${id}/pay`,
        { paidOn: '2026-10-20' },
        '00000000-0000-4000-8000-0000000d0099',
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('is not paid before it is confirmed, nor without money', async () => {
    const { gateway } = world();
    const session = await client(gateway, 100);
    const { id } = await ask(gateway, session, 'POST', '/api/clientes/rentals', RENTAL);
    await expect(pay(gateway, session, id)).rejects.toMatchObject({ status: 409 });
    await ask(gateway, ADMIN, 'POST', `/api/clientes/branch-rentals/${id}/confirm`, {
      price: 1_440,
    });
    await expect(pay(gateway, session, id)).rejects.toMatchObject({ status: 422 });
  });

  it('is cancelled by the client while unpaid', async () => {
    const { gateway, funds } = world();
    const session = await client(gateway, funds);
    const { id } = await ask(gateway, session, 'POST', '/api/clientes/rentals', RENTAL);
    expect(await ask(gateway, session, 'POST', `/api/clientes/rentals/${id}/cancel`)).toMatchObject(
      {
        status: 'CANCELLED',
      },
    );
  });

  it('is cancelled through viajes, not from here, once it is paid', async () => {
    const { gateway } = world();
    const { session, id } = await paidOnline(gateway);
    await expect(
      ask(gateway, session, 'POST', `/api/clientes/rentals/${id}/cancel`),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('lists the rentals of the client by text', async () => {
    const { gateway } = world();
    const { session } = await paidOnline(gateway);
    const found = await ask(
      gateway,
      session,
      'GET',
      '/api/clientes/rentals/mine?status=all&q=atitlan',
    );
    expect(found.items).toHaveLength(1);
    const none = await ask(
      gateway,
      session,
      'GET',
      '/api/clientes/rentals/mine?status=all&q=flores',
    );
    expect(none.items).toHaveLength(0);
  });
});

describe('the fake counter rentals', () => {
  const COUNTER = {
    ...RENTAL,
    nit: 'CF',
    clientName: 'Agencia Los Cerritos',
    email: null,
    price: 2_000,
  };

  it('are recorded confirmed and paid in cash by the branch admin', async () => {
    const { gateway } = world();
    const rental = await ask(gateway, ADMIN, 'POST', '/api/clientes/branch-rentals', COUNTER);
    expect(rental).toMatchObject({ status: 'CONFIRMED', channel: 'COUNTER', price: 2_000 });
    const paid = await pay(gateway, ADMIN, rental.id);
    expect(paid).toMatchObject({ status: 'PAID', paidOn: '2026-10-20' });
    const listed = await ask(
      gateway,
      ADMIN,
      'GET',
      '/api/clientes/branch-rentals?status=PAID&q=cerritos',
    );
    expect(listed.items.map((item) => item.id)).toEqual([rental.id]);
  });

  it('are recorded only for the branch of the admin', async () => {
    const { gateway } = world();
    await expect(
      ask(gateway, OTHER_ADMIN, 'POST', '/api/clientes/branch-rentals', COUNTER),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('the fake rental requests of viajes', () => {
  async function requestOf(gateway: FakeGateway) {
    const { session, id } = await paidOnline(gateway);
    return { session, id };
  }

  it('show a paid rental waiting for its bus, and not an unpaid one', async () => {
    const { gateway, funds } = world();
    const session = await client(gateway, funds);
    await ask(gateway, session, 'POST', '/api/clientes/rentals', RENTAL);
    const before = await ask(gateway, ADMIN, 'GET', '/api/viajes/rental-requests?status=all');
    expect(before.items).toHaveLength(0);
    const { id } = await requestOf(gateway);
    const after = await ask(gateway, ADMIN, 'GET', '/api/viajes/rental-requests?status=all');
    expect(after.items).toEqual([expect.objectContaining({ id, status: 'PENDING', tripId: null })]);
  });

  it('are assigned a bus and a driver, which creates the rental trip', async () => {
    const { gateway } = world();
    const { id } = await requestOf(gateway);
    const trip = await ask(
      gateway,
      ADMIN,
      'POST',
      `/api/viajes/rental-requests/${id}/assignment`,
      ASSIGNMENT,
    );
    expect(trip).toMatchObject({ type: 'RENTAL', busId: BUS, routeId: null, ticketPrice: null });
    expect(gateway.trips.filter((candidate) => candidate.type === 'RENTAL')).toHaveLength(1);
    await expect(
      ask(gateway, ADMIN, 'POST', `/api/viajes/rental-requests/${id}/assignment`, ASSIGNMENT),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('are not assigned a bus that is busy then, or too small, or a request nobody paid', async () => {
    const { gateway } = world();
    const { id } = await requestOf(gateway);
    addTrip(gateway, '00000000-0000-4000-8000-0000000c0009', { hours: 1 }).busId = BUS;
    const busy = gateway.trips.at(-1)!;
    busy.departureAt = '2026-11-10T13:00:00.000Z';
    busy.estimatedArrivalAt = '2026-11-10T16:00:00.000Z';
    await expect(
      ask(gateway, ADMIN, 'POST', `/api/viajes/rental-requests/${id}/assignment`, ASSIGNMENT),
    ).rejects.toMatchObject({ status: 409 });
    gateway.trips.splice(gateway.trips.indexOf(busy), 1);
    gateway.buses[0]!.capacity = 20;
    await expect(
      ask(gateway, ADMIN, 'POST', `/api/viajes/rental-requests/${id}/assignment`, ASSIGNMENT),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      ask(
        gateway,
        ADMIN,
        'POST',
        '/api/viajes/rental-requests/00000000-0000-4000-8000-000000000999/assignment',
        ASSIGNMENT,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('are cancelled after they are paid: the trip goes, the wallet is refunded once and the rental ends', async () => {
    const { gateway } = world();
    const { session, id } = await requestOf(gateway);
    await ask(gateway, ADMIN, 'POST', `/api/viajes/rental-requests/${id}/assignment`, ASSIGNMENT);
    const cancelled = await ask(gateway, ADMIN, 'POST', `/api/viajes/rental-requests/${id}/cancel`);
    expect(cancelled).toMatchObject({ status: 'CANCELLED', tripId: null });
    expect(gateway.trips.filter((candidate) => candidate.type === 'RENTAL')).toHaveLength(0);
    expect(gateway.clients.balanceOf(session.user.id)).toBe(5_000);
    await ask(gateway, ADMIN, 'POST', `/api/viajes/rental-requests/${id}/cancel`);
    expect(gateway.clients.balanceOf(session.user.id)).toBe(5_000);
    const mine = await ask(gateway, session, 'GET', '/api/clientes/rentals/mine?status=all');
    expect(mine.items[0]).toMatchObject({ status: 'CANCELLED' });
  });

  it('are not cancelled once the bus left', async () => {
    const { gateway } = world();
    const { id } = await requestOf(gateway);
    const trip = await ask(
      gateway,
      ADMIN,
      'POST',
      `/api/viajes/rental-requests/${id}/assignment`,
      ASSIGNMENT,
    );
    gateway.trips.find((candidate) => candidate.id === trip.id)!.status = 'IN_TRANSIT';
    await expect(
      ask(gateway, ADMIN, 'POST', `/api/viajes/rental-requests/${id}/cancel`),
    ).rejects.toMatchObject({ status: 409 });
  });
});
