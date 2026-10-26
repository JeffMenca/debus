import { randomUUID } from 'node:crypto';
import { exampleTripScheduled, type TicketPage } from '@debus/contracts';
import { InMemoryEventBus } from '@debus/messaging';
import { identityHeaders } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { testClients, testNit } from './support/clients';
import { type TestTrips, inHours, testTrips } from './support/trips';

describe('the ticket history of a client', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let trips: TestTrips;
  let clients: ReturnType<typeof testClients>;

  const history = (clientId: string, query: Record<string, string | number> = {}) =>
    request(app.getHttpServer())
      .get('/tickets')
      .query(query)
      .set(identityHeaders(clientId, 'CLIENT'));
  const idsOf = (body: unknown) => (body as TicketPage).items.map((ticket) => ticket.id);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    bus = InMemoryEventBus.attach(app);
    trips = testTrips(prisma);
    clients = testClients(prisma);
  });
  afterAll(async () => {
    await trips.cleanUp();
    await clients.cleanUp();
    await app.close();
  });

  it('shows the tickets bought online and the counter sales linked by the NIT', async () => {
    const tripId = await trips.create();
    const clientId = clients.id();
    const nit = testNit();
    const before = await trips.ticket(tripId, { nit });
    const someoneElse = await trips.ticket(tripId, { channel: 'ONLINE', clientId: clients.id() });
    const generic = await trips.ticket(tripId);
    await bus.deliver('ProfileUpdated', {
      clientId,
      nit,
      fullName: 'Ana Méndez',
      updatedAt: new Date().toISOString(),
    });
    const online = await trips.ticket(tripId, { channel: 'ONLINE', clientId, status: 'PENDING' });
    const sold = await request(app.getHttpServer())
      .post('/counter/tickets')
      .set(identityHeaders(randomUUID(), 'CASHIER', exampleTripScheduled.branchId))
      .set('idempotency-key', randomUUID())
      .send({ tripId, seats: [21], paidOn: '2026-10-20', nit });
    expect(sold.status).toBe(201);

    const { body, status } = await history(clientId);

    expect(status).toBe(200);
    // Newest sale first: the counter sale made after the account, the online one, the old one.
    expect(idsOf(body)).toEqual([sold.body.id, online, before]);
    expect(idsOf(body)).not.toContain(someoneElse);
    expect(idsOf(body)).not.toContain(generic);
    expect((body as TicketPage).items[1]).toMatchObject({ status: 'PENDING', channel: 'ONLINE' });
    expect((body as TicketPage).items[0]).toMatchObject({ channel: 'COUNTER', seats: [21] });
  });

  it('pages on the server and points to the trip that leaves soonest', async () => {
    const clientId = clients.id();
    const later = await trips.create({ departureAt: inHours(80) });
    const sooner = await trips.create({ departureAt: inHours(10) });
    const departed = await trips.create({ departureAt: inHours(-3) });
    await trips.ticket(later, { channel: 'ONLINE', clientId });
    const next = await trips.ticket(sooner, { channel: 'ONLINE', clientId });
    await trips.ticket(departed, { channel: 'ONLINE', clientId });

    const first = await history(clientId, { pageSize: 2 });
    const second = await history(clientId, { pageSize: 2, page: 2 });

    expect(first.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(idsOf(first.body)).toHaveLength(2);
    expect(idsOf(second.body)).toHaveLength(1);
    expect([...idsOf(first.body), ...idsOf(second.body)]).toHaveLength(3);
    expect((first.body as TicketPage).summary.next?.id).toBe(next);
    expect((second.body as TicketPage).summary.next?.id).toBe(next);
  });

  it('has no next trip once every trip left, and filters by day and text', async () => {
    const clientId = clients.id();
    const departure = new Date(inHours(-5));
    const day = departure.toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
    const tripId = await trips.create({ departureAt: departure.toISOString() });
    await prisma.trip.update({ where: { tripId }, data: { searchText: 'quetzaltenango peten' } });
    const ticket = await trips.ticket(tripId, { channel: 'ONLINE', clientId });

    const all = await history(clientId);
    const sameDay = await history(clientId, { from: day, to: day, q: 'PETÉN' });
    const otherDay = await history(clientId, { from: '2099-01-01' });
    const otherText = await history(clientId, { q: 'flores' });

    expect((all.body as TicketPage).summary.next).toBeNull();
    expect(idsOf(sameDay.body)).toEqual([ticket]);
    expect((otherDay.body as TicketPage).total).toBe(0);
    expect((otherText.body as TicketPage).total).toBe(0);
  });

  it('is only for clients with a session', async () => {
    const server = app.getHttpServer();

    expect((await request(server).get('/tickets')).status).toBe(401);
    expect(
      (
        await request(server)
          .get('/tickets')
          .set(identityHeaders(randomUUID(), 'CASHIER', exampleTripScheduled.branchId))
      ).status,
    ).toBe(403);
    expect((await history(randomUUID(), { pageSize: 101 })).status).toBe(400);
  });
});
