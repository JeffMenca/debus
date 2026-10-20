import { randomUUID } from 'node:crypto';
import { type SeatMap, ticketSoldPayloadSchema } from '@debus/contracts';
import { identityHeaders } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { testClients } from './support/clients';
import { PeerStub } from './support/peer-stub';
import { soldEvents } from './support/sold-events';
import { type TestTrips, testTrips } from './support/trips';

// ventas talks to a stub of viajes and clientes on a real port, with the real ServiceHttpClient, so
// the timeouts, the retries and the circuit breaker run for real. The thresholds are small to keep the tests short.
const ENV = {
  SERVICE_AUTH: 'none',
  CIRCUIT_FAILURE_THRESHOLD: '2',
  CIRCUIT_OPEN_MS: '1000',
} as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function startApp(stub: PeerStub): Promise<INestApplication> {
  Object.assign(process.env, ENV, {
    SERVICE_URL_VIAJES: stub.url,
    SERVICE_URL_CLIENTES: stub.url,
  });
  return createTestApp();
}

function harness() {
  const stub = new PeerStub();
  const state = {} as {
    app: INestApplication;
    prisma: PrismaService;
    trips: TestTrips;
    clients: ReturnType<typeof testClients>;
    sold: ReturnType<typeof soldEvents>;
  };
  const purchases: string[] = [];
  const saved = { ...process.env };

  const buy = (
    who: Record<string, string>,
    body: Record<string, unknown>,
    key: string | null = randomUUID(),
  ) => {
    if (key) {
      purchases.push(key);
      state.sold.track(key);
    }
    const call = request(state.app.getHttpServer())
      .post('/purchases')
      .set(who)
      .send({ paidOn: '2026-10-19', ...body });
    return key ? call.set('idempotency-key', key) : call;
  };
  const read = (who: Record<string, string>, ticketId: string) =>
    request(state.app.getHttpServer()).get(`/purchases/${ticketId}`).set(who);
  const takenSeats = async (tripId: string): Promise<number[]> => {
    const { body } = await request(state.app.getHttpServer())
      .get(`/trips/${tripId}/seats`)
      .set(identityHeaders(randomUUID(), 'CLIENT'))
      .expect(200);
    return (body as SeatMap).taken;
  };
  // Makes a pending purchase look as if it had been waiting for two minutes, with nobody holding it.
  const letItRest = (ticketId: string) =>
    state.prisma.$executeRawUnsafe(
      `UPDATE purchases SET updated_at = now() - interval '2 minutes', locked_until = NULL WHERE id = $1::uuid`,
      ticketId,
    );
  const recover = () => request(state.app.getHttpServer()).post('/internal/purchases/recover');
  const newClient = async () => {
    const clientId = await state.clients.create();
    return { clientId, who: identityHeaders(clientId, 'CLIENT') };
  };

  return {
    stub,
    state,
    buy,
    read,
    takenSeats,
    letItRest,
    recover,
    newClient,
    async start() {
      await stub.start();
      state.app = await startApp(stub);
      state.prisma = state.app.get(PrismaService);
      state.trips = testTrips(state.prisma);
      state.clients = testClients(state.prisma);
      state.sold = soldEvents(state.prisma);
    },
    async stop() {
      await state.prisma.purchase.deleteMany({ where: { id: { in: purchases } } });
      await state.sold.cleanUp();
      await state.trips.cleanUp();
      await state.clients.cleanUp();
      await state.app.close();
      await stub.stop();
      for (const name of Object.keys(ENV)) delete process.env[name];
      delete process.env.SERVICE_URL_VIAJES;
      delete process.env.SERVICE_URL_CLIENTES;
      Object.assign(process.env, saved);
    },
  };
}

describe('buying a ticket with the wallet', () => {
  const h = harness();
  const { stub } = h;

  beforeAll(() => h.start());
  afterAll(() => h.stop());
  beforeEach(() => stub.reset());

  it('buys two seats: charges the wallet with the ticket id, confirms and announces the sale once', async () => {
    const tripId = await h.state.trips.create();
    const { clientId, who } = await h.newClient();
    const key = randomUUID();

    const response = await h.buy(who, { tripId, seats: [4, 3] }, key).expect(201);

    expect(response.body).toMatchObject({
      ticketId: key,
      status: 'CONFIRMED',
      seats: [3, 4],
      amount: 170,
      failure: null,
      message: null,
      ticket: { id: key, status: 'CONFIRMED', channel: 'ONLINE', seats: [3, 4], total: 170 },
    });
    expect(stub.debitCalls()).toHaveLength(1);
    const [debit] = stub.debitCalls();
    expect(debit?.headers['idempotency-key']).toBe(key);
    expect(debit?.body).toMatchObject({
      clientId,
      amount: 170,
      kind: 'TICKET',
      reference: key,
      occurredOn: '2026-10-19',
      payBy: expect.any(String),
    });
    const events = await h.state.sold.of(key);
    expect(events).toHaveLength(1);
    expect(ticketSoldPayloadSchema.parse(events[0])).toMatchObject({
      ticketId: key,
      channel: 'ONLINE',
      clientId,
      email: stub.email,
      seats: [3, 4],
      total: 170,
    });
    expect(await h.takenSeats(tripId)).toEqual([3, 4]);
    const purchase = await h.state.prisma.purchase.findUniqueOrThrow({ where: { id: key } });
    expect(purchase).toMatchObject({ status: 'CONFIRMED', debitAttempts: 1, lockedUntil: null });
  });

  it('frees the seats when the wallet has no balance, and repeats that answer without calling it again', async () => {
    const tripId = await h.state.trips.create();
    const { who } = await h.newClient();
    const key = randomUUID();
    stub.wallet = 'insufficient';

    const first = await h.buy(who, { tripId, seats: [5] }, key).expect(422);

    expect(first.body.message).toContain('No tienes saldo suficiente en tu cartera.');
    expect(first.body.message).toContain('Tus asientos quedaron libres.');
    expect(await h.takenSeats(tripId)).toEqual([]);
    expect(await h.state.prisma.ticket.count({ where: { id: key } })).toBe(0);
    const purchase = await h.state.prisma.purchase.findUniqueOrThrow({ where: { id: key } });
    expect(purchase).toMatchObject({ status: 'FAILED', failure: 'INSUFFICIENT_BALANCE' });
    expect(await h.state.sold.of(key)).toHaveLength(0);

    stub.calls.length = 0;
    const again = await h.buy(who, { tripId, seats: [5] }, key).expect(422);

    expect(again.body.message).toContain('tus asientos quedaron libres');
    expect(stub.calls).toHaveLength(0);
    // The seat can be bought by someone else now.
    stub.wallet = 'ok';
    const other = await h.newClient();
    await h.buy(other.who, { tripId, seats: [5] }).expect(201);
  });

  it('keeps the seats when the answer of the wallet is lost, and confirms with the same key without charging twice', async () => {
    const tripId = await h.state.trips.create();
    const { who } = await h.newClient();
    const key = randomUUID();
    stub.wallet = 'drop';

    const first = await h.buy(who, { tripId, seats: [8] }, key).expect(202);

    expect(first.body).toMatchObject({
      status: 'PENDING',
      ticket: null,
      message: expect.stringContaining('no repitas la compra'),
    });
    expect(await h.takenSeats(tripId)).toEqual([8]);
    expect(await h.state.sold.of(key)).toHaveLength(0);
    const waiting = await h.read(who, key).expect(200);
    expect(waiting.body.status).toBe('PENDING');

    stub.wallet = 'ok';
    const retry = await h.buy(who, { tripId, seats: [8] }, key).expect(201);

    expect(retry.body).toMatchObject({ status: 'CONFIRMED', ticket: { id: key } });
    expect(stub.applied.size).toBe(1);
    const events = await h.state.sold.of(key);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ email: stub.email });
  });

  it('keeps the seats when the wallet answers after the timeout, and settles it later with the same key', async () => {
    const tripId = await h.state.trips.create();
    const { who } = await h.newClient();
    const key = randomUUID();
    stub.wallet = 'slow';

    const first = await h.buy(who, { tripId, seats: [9] }, key).expect(202);

    expect(first.body.status).toBe('PENDING');
    expect(await h.takenSeats(tripId)).toEqual([9]);
    await sleep(900);
    stub.wallet = 'ok';
    const retry = await h.buy(who, { tripId, seats: [9] }, key).expect(201);
    expect(retry.body.status).toBe('CONFIRMED');
    expect(stub.applied.size).toBe(1);
  });

  it('is settled by the recovery job when nobody repeats the request', async () => {
    const tripId = await h.state.trips.create();
    const { who } = await h.newClient();
    const key = randomUUID();
    stub.wallet = 'drop';
    await h.buy(who, { tripId, seats: [10] }, key).expect(202);
    stub.wallet = 'ok';
    await h.letItRest(key);

    const response = await h.recover().expect(200);

    expect(response.body).toMatchObject({
      resumed: expect.any(Number),
      stillPending: expect.any(Number),
      releasedCounterTickets: expect.any(Number),
    });
    expect(response.body.resumed).toBeGreaterThanOrEqual(1);
    const purchase = await h.state.prisma.purchase.findUniqueOrThrow({ where: { id: key } });
    expect(purchase.status).toBe('CONFIRMED');
    const events = await h.state.sold.of(key);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ email: stub.email });
  });

  it('does not touch a purchase that is not old enough for the recovery job', async () => {
    const tripId = await h.state.trips.create();
    const { who } = await h.newClient();
    const key = randomUUID();
    stub.wallet = 'drop';
    await h.buy(who, { tripId, seats: [11] }, key).expect(202);
    stub.wallet = 'ok';
    stub.calls.length = 0;

    await h.recover().expect(200);

    expect(
      stub.debitCalls().filter((call) => call.headers['idempotency-key'] === key),
    ).toHaveLength(0);
    expect((await h.state.prisma.purchase.findUniqueOrThrow({ where: { id: key } })).status).toBe(
      'PENDING',
    );
  });

  it('refuses a trip that already left and charges nothing', async () => {
    const tripId = await h.state.trips.create();
    const { who } = await h.newClient();
    const key = randomUUID();
    stub.trip = 'departed';

    const response = await h.buy(who, { tripId, seats: [1] }, key).expect(409);

    expect(response.body.message).toBe('Este viaje ya salió. Elige otro horario.');
    expect(stub.debitCalls()).toHaveLength(0);
    expect(await h.state.prisma.purchase.count({ where: { id: key } })).toBe(0);
    expect(await h.state.prisma.ticket.count({ where: { id: key } })).toBe(0);
  });

  it('gives a seat to one of 20 simultaneous buyers and charges only that one', async () => {
    const tripId = await h.state.trips.create();
    const buyers = await Promise.all(Array.from({ length: 20 }, () => h.newClient()));

    const responses = await Promise.all(
      buyers.map(({ who }) => h.buy(who, { tripId, seats: [7] })),
    );

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(19);
    expect(stub.debitCalls()).toHaveLength(1);
    expect(await h.takenSeats(tripId)).toEqual([7]);
  });

  it('makes one ticket, one charge and one announcement of five identical requests at once', async () => {
    const tripId = await h.state.trips.create();
    const { who } = await h.newClient();
    const key = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => h.buy(who, { tripId, seats: [12, 13] }, key)),
    );

    for (const response of responses) expect([201, 202]).toContain(response.status);
    const settled = await h.read(who, key).expect(200);
    expect(settled.body.status).toBe('CONFIRMED');
    expect(stub.applied.size).toBe(1);
    expect(await h.state.prisma.ticket.count({ where: { id: key } })).toBe(1);
    expect(await h.state.sold.of(key)).toHaveLength(1);
  });

  it('refuses a key that was used for other seats', async () => {
    const tripId = await h.state.trips.create();
    const { who } = await h.newClient();
    const key = randomUUID();
    await h.buy(who, { tripId, seats: [14] }, key).expect(201);

    const response = await h.buy(who, { tripId, seats: [15] }, key).expect(409);

    expect(response.body.message).toBe(
      'Esa compra ya se registró con otros datos. Vuelve a empezar.',
    );
  });

  it('refuses a person whose account has not reached ventas yet', async () => {
    const tripId = await h.state.trips.create();

    const response = await h
      .buy(identityHeaders(randomUUID(), 'CLIENT'), { tripId, seats: [1] })
      .expect(409);

    expect(response.body.message).toContain('preparar tu cuenta');
    expect(stub.calls).toHaveLength(0);
  });

  it('refuses a wallet that does not exist yet and frees the seats', async () => {
    const tripId = await h.state.trips.create();
    const { who } = await h.newClient();
    stub.wallet = 'no-wallet';

    await h.buy(who, { tripId, seats: [2] }).expect(409);

    expect(await h.takenSeats(tripId)).toEqual([]);
  });

  it('validates the seats, the key and the session before doing anything', async () => {
    const tripId = await h.state.trips.create();
    const { who } = await h.newClient();

    for (const seats of [[0], [2, 2], []]) await h.buy(who, { tripId, seats }).expect(400);
    await h.buy(who, { tripId, seats: [1] }, null).expect(400);
    await request(h.state.app.getHttpServer())
      .post('/purchases')
      .set('idempotency-key', randomUUID())
      .send({ tripId, seats: [1], paidOn: '2026-10-19' })
      .expect(401);
    expect(stub.calls).toHaveLength(0);
  });

  it('answers a purchase to the person who made it and says nothing of the purchase of someone else', async () => {
    const tripId = await h.state.trips.create();
    const mine = await h.newClient();
    const other = await h.newClient();
    const key = randomUUID();
    await h.buy(mine.who, { tripId, seats: [16] }, key).expect(201);

    await h.read(mine.who, key).expect(200);
    await h.read(other.who, key).expect(404);
    await h.read(mine.who, randomUUID()).expect(404);
    await h.read(mine.who, 'not-a-uuid').expect(400);
  });

  it('frees a counter ticket that stayed pending for more than half an hour, and only that one', async () => {
    const tripId = await h.state.trips.create();
    const forgotten = randomUUID();
    const recent = randomUUID();
    const online = randomUUID();
    const create = (id: string, channel: 'COUNTER' | 'ONLINE', ageMinutes: number, seat: number) =>
      h.state.prisma.ticket.create({
        data: {
          id,
          tripId,
          status: 'PENDING',
          channel,
          nit: 'CF',
          buyerName: 'Consumidor final',
          unitPrice: 85,
          total: 85,
          paidOn: new Date('2026-10-19'),
          createdAt: new Date(Date.now() - ageMinutes * 60_000),
          seats: { create: [{ tripId, seatNumber: seat }] },
        },
      });
    await create(forgotten, 'COUNTER', 31, 20);
    await create(recent, 'COUNTER', 5, 21);
    await create(online, 'ONLINE', 90, 22);

    const response = await h.recover().expect(200);

    expect(response.body.releasedCounterTickets).toBeGreaterThanOrEqual(1);
    expect(await h.state.prisma.ticket.count({ where: { id: forgotten } })).toBe(0);
    expect(await h.state.prisma.ticket.count({ where: { id: { in: [recent, online] } } })).toBe(2);
    expect(await h.takenSeats(tripId)).toEqual([21, 22]);
  });
});

describe('buying a ticket while a service it depends on fails', () => {
  const h = harness();
  const { stub } = h;

  beforeAll(() => h.start());
  afterAll(() => h.stop());
  beforeEach(() => stub.reset());

  it('stops calling the wallet once it keeps failing, and settles the pending purchases when it recovers', async () => {
    const tripId = await h.state.trips.create();
    const { who } = await h.newClient();
    const [first, second, third] = [randomUUID(), randomUUID(), randomUUID()];
    stub.wallet = 'unavailable';

    const one = await h.buy(who, { tripId, seats: [1] }, first).expect(202);
    const two = await h.buy(who, { tripId, seats: [2] }, second).expect(202);
    stub.calls.length = 0;
    const three = await h.buy(who, { tripId, seats: [3] }, third).expect(503);

    expect(one.body.status).toBe('PENDING');
    expect(two.body.status).toBe('PENDING');
    expect(three.body.message).toContain('No pudimos conectar con tu cartera');
    // The circuit is open: nothing reached the stub, not even the check of the trip, and nothing was held.
    expect(stub.calls).toHaveLength(0);
    expect(await h.state.prisma.purchase.count({ where: { id: third } })).toBe(0);
    expect(await h.takenSeats(tripId)).toEqual([1, 2]);

    await sleep(1100);
    stub.wallet = 'ok';
    await h.letItRest(first);
    await h.letItRest(second);
    await h.recover().expect(200);

    for (const id of [first, second]) {
      const purchase = await h.state.prisma.purchase.findUniqueOrThrow({ where: { id } });
      expect(purchase.status).toBe('CONFIRMED');
    }
    expect(stub.applied.size).toBe(2);
  });

  it('answers 503 and holds nothing when viajes does not answer, and stops retrying once its circuit opens', async () => {
    const tripId = await h.state.trips.create();
    const { who } = await h.newClient();
    const key = randomUUID();
    stub.trip = 'unavailable';

    const response = await h.buy(who, { tripId, seats: [1] }, key).expect(503);

    expect(response.body.message).toContain('No pudimos confirmar que el viaje sigue a la venta');
    // Three attempts were allowed; the second failure opened the circuit, so the third never left.
    expect(stub.calls).toHaveLength(2);
    expect(await h.state.prisma.purchase.count({ where: { id: key } })).toBe(0);
    expect(await h.state.prisma.ticket.count({ where: { id: key } })).toBe(0);
    expect(stub.debitCalls()).toHaveLength(0);
  });
});
