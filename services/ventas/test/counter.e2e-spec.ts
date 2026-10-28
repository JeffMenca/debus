import { randomUUID } from 'node:crypto';
import { exampleTripDeparted, ticketSoldPayloadSchema } from '@debus/contracts';
import { InMemoryEventBus } from '@debus/messaging';
import { identityHeaders } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { testClients, testNit } from './support/clients';
import { soldEvents } from './support/sold-events';
import { type TestTrips, inHours, testTrips } from './support/trips';

describe('selling at the counter', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let trips: TestTrips;
  let bus: InMemoryEventBus;
  let clients: ReturnType<typeof testClients>;
  let sold: ReturnType<typeof soldEvents>;
  const branchId = randomUUID();
  const cashier = identityHeaders(randomUUID(), 'CASHIER', branchId);

  const sell = (body: Record<string, unknown>, key = randomUUID(), who = cashier) => {
    sold.track(key);
    return request(app.getHttpServer())
      .post('/counter/tickets')
      .set(who)
      .set('idempotency-key', key)
      .send({ paidOn: '2026-10-18', ...body });
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    bus = InMemoryEventBus.attach(app);
    trips = testTrips(prisma);
    clients = testClients(prisma);
    sold = soldEvents(prisma);
  });
  afterAll(async () => {
    await sold.cleanUp();
    await trips.cleanUp();
    await clients.cleanUp();
    await app.close();
  });

  it('sells two seats in cash to the generic client and announces the sale once', async () => {
    const tripId = await trips.create({ branchId });
    const key = randomUUID();

    const first = await sell({ tripId, seats: [10, 9] }, key).expect(201);
    const retry = await sell({ tripId, seats: [9, 10] }, key).expect(201);

    expect(first.body).toMatchObject({
      id: key,
      status: 'CONFIRMED',
      channel: 'COUNTER',
      seats: [9, 10],
      nit: 'CF',
      buyerName: 'Consumidor final',
      unitPrice: 85,
      total: 170,
      paidOn: '2026-10-18',
    });
    expect(retry.body).toEqual(first.body);
    const events = await sold.of(key);
    expect(events).toHaveLength(1);
    expect(ticketSoldPayloadSchema.parse(events[0])).toMatchObject({
      branchId,
      channel: 'COUNTER',
      clientId: null,
      seats: [9, 10],
    });
  });

  it('refuses a trip that already left, even before its scheduled hour, and leaves nothing behind', async () => {
    const tripId = await trips.create({ branchId, departureAt: inHours(2) });
    await bus.deliver('TripDeparted', { ...exampleTripDeparted, tripId, branchId });
    const key = randomUUID();

    const response = await sell({ tripId, seats: [4] }, key).expect(409);

    expect(response.body.message).toBe('Este viaje ya salió. Elige otro horario.');
    expect(await prisma.ticket.count({ where: { id: key } })).toBe(0);
    expect(await prisma.ticketSeat.count({ where: { tripId } })).toBe(0);
    expect(await sold.of(key)).toHaveLength(0);
  });

  it('links the sale to the client who holds the NIT', async () => {
    const tripId = await trips.create({ branchId });
    const clientId = clients.id();
    const nit = testNit();
    await prisma.clientNit.create({
      data: { clientId, nit, fullName: 'Ana Méndez', updatedAt: new Date() },
    });

    const response = await sell({ tripId, seats: [1], nit }).expect(201);

    expect(response.body).toMatchObject({ nit, buyerName: 'Ana Méndez' });
    expect(
      await prisma.ticket.findUniqueOrThrow({ where: { id: response.body.id } }),
    ).toMatchObject({ clientId });
  });

  it('links a sale whose NIT arrived between the lookup and the confirmation', async () => {
    const tripId = await trips.create({ branchId });
    const nit = testNit();
    const clientId = clients.id();
    const key = randomUUID();
    sold.track(key);
    await prisma.ticket.create({
      data: {
        id: key,
        tripId,
        status: 'PENDING',
        channel: 'COUNTER',
        nit,
        buyerName: 'Ana Méndez',
        unitPrice: 85,
        total: 85,
        paidOn: new Date('2026-10-18T00:00:00.000Z'),
        seats: { create: [{ tripId, seatNumber: 8 }] },
      },
    });
    await prisma.clientNit.create({
      data: { clientId, nit, fullName: 'Ana Méndez', updatedAt: new Date() },
    });

    await sell({ tripId, seats: [8], nit }, key).expect(201);

    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: key } })).toMatchObject({
      status: 'CONFIRMED',
      clientId,
    });
    expect(await sold.of(key)).toEqual([expect.objectContaining({ clientId })]);
  });

  it('refuses a seat 0, a repeated seat and no seats before holding anything', async () => {
    const tripId = await trips.create({ branchId });

    for (const seats of [[0], [2, 2], []]) {
      await sell({ tripId, seats }).expect(400);
    }

    expect(await prisma.ticket.count({ where: { tripId } })).toBe(0);
  });

  it('refuses a seat already sold and a key reused for another sale', async () => {
    const tripId = await trips.create({ branchId });
    const key = randomUUID();
    await sell({ tripId, seats: [5] }, key).expect(201);

    const taken = await sell({ tripId, seats: [5, 6] }).expect(409);
    const reused = await sell({ tripId, seats: [7] }, key).expect(409);

    expect(taken.body.message).toBe(
      'Alguno de los asientos que elegiste ya fue vendido. Elige otros.',
    );
    expect(reused.body.message).toBe('Esa venta ya se registró con otros datos. Vuelve a empezar.');
  });

  it('only sells and lists the trips that leave from the branch of whoever sells', async () => {
    const own = await trips.create({ branchId });
    const other = await trips.create({ branchId: randomUUID() });

    const refused = await sell({ tripId: other, seats: [1] }).expect(403);
    const list = await request(app.getHttpServer())
      .get('/counter/trips')
      .query({ pageSize: 100 })
      .set(cashier)
      .expect(200);

    expect(refused.body.message).toBe('Solo puedes vender viajes que salen de tu sucursal.');
    const listed = list.body.items.map((trip: { tripId: string }) => trip.tripId);
    expect(listed).toContain(own);
    expect(listed).not.toContain(other);
  });

  it('lets the branch admin sell, and nobody else', async () => {
    const tripId = await trips.create({ branchId });
    const admin = identityHeaders(randomUUID(), 'BRANCH_ADMIN', branchId);

    await sell({ tripId, seats: [3] }, randomUUID(), admin).expect(201);
    await sell(
      { tripId, seats: [4] },
      randomUUID(),
      identityHeaders(randomUUID(), 'CLIENT'),
    ).expect(403);
    await request(app.getHttpServer())
      .post('/counter/tickets')
      .send({ tripId, seats: [4] })
      .expect(401);
  });

  it('asks for a valid key and answers 404 for a trip it does not know', async () => {
    await request(app.getHttpServer())
      .post('/counter/tickets')
      .set(cashier)
      .send({ tripId: randomUUID(), seats: [1], paidOn: '2026-10-18' })
      .expect(400);
    await sell({ tripId: randomUUID(), seats: [1] }).expect(404);
  });
});
