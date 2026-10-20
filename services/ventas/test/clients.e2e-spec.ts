import { InMemoryEventBus } from '@debus/messaging';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { testClients, testNit } from './support/clients';
import { type TestTrips, testTrips } from './support/trips';

describe('counter sales linked to the client by NIT', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let trips: TestTrips;
  let clients: ReturnType<typeof testClients>;
  let tripId: string;

  const profile = (clientId: string, nit: string | null, updatedAt: string) => ({
    clientId,
    nit,
    fullName: 'Ana Méndez',
    updatedAt,
  });
  const clientOf = async (ticketId: string) =>
    (await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).clientId;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    bus = InMemoryEventBus.attach(app);
    trips = testTrips(prisma);
    clients = testClients(prisma);
    tripId = await trips.create();
  });
  afterAll(async () => {
    await trips.cleanUp();
    await clients.cleanUp();
    await app.close();
  });

  it('links the counter sales made with the NIT before the account existed', async () => {
    const nit = testNit();
    const counter = await trips.ticket(tripId, { nit });
    const online = await trips.ticket(tripId, { nit, channel: 'ONLINE' });
    const generic = await trips.ticket(tripId);
    const clientId = clients.id();

    await bus.deliver('ProfileUpdated', profile(clientId, nit, '2026-10-18T15:00:00.000Z'));

    expect(await clientOf(counter)).toBe(clientId);
    expect(await clientOf(online)).toBeNull();
    expect(await clientOf(generic)).toBeNull();
    expect(await prisma.clientNit.findUniqueOrThrow({ where: { clientId } })).toMatchObject({
      nit,
      fullName: 'Ana Méndez',
    });
  });

  it('never goes back to an older NIT when the events arrive out of order', async () => {
    const [older, newer] = [testNit(), testNit()];
    const ticket = await trips.ticket(tripId, { nit: older });
    const clientId = clients.id();

    await bus.deliver('ProfileUpdated', profile(clientId, newer, '2026-10-18T16:00:00.000Z'));
    await bus.deliver('ProfileUpdated', profile(clientId, older, '2026-10-18T15:00:00.000Z'));

    expect(await prisma.clientNit.findUniqueOrThrow({ where: { clientId } })).toMatchObject({
      nit: newer,
    });
    expect(await clientOf(ticket)).toBeNull();
  });

  it('keeps what was linked when the client changes the NIT', async () => {
    const [first, second] = [testNit(), testNit()];
    const ticket = await trips.ticket(tripId, { nit: first });
    const clientId = clients.id();

    await bus.deliver('ProfileUpdated', profile(clientId, first, '2026-10-18T15:00:00.000Z'));
    await bus.deliver('ProfileUpdated', profile(clientId, second, '2026-10-18T16:00:00.000Z'));

    expect(await clientOf(ticket)).toBe(clientId);
  });

  it('never moves a sale already linked to another client', async () => {
    const nit = testNit();
    const owner = clients.id();
    const ticket = await trips.ticket(tripId, { nit, clientId: owner });

    await bus.deliver('ProfileUpdated', profile(clients.id(), nit, '2026-10-18T15:00:00.000Z'));

    expect(await clientOf(ticket)).toBe(owner);
  });
});
