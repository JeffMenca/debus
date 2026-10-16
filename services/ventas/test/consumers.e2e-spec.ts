import { randomUUID } from 'node:crypto';
import { InMemoryEventBus } from '@debus/messaging';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { scheduledTrip, testTrips } from './support/trips';

describe('events ventas consumes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let trips: ReturnType<typeof testTrips>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    bus = InMemoryEventBus.attach(app);
    trips = testTrips(prisma);
  });
  afterAll(async () => {
    await trips.cleanUp();
    await app.close();
  });

  it('copies a scheduled regular trip once, however many times it arrives', async () => {
    const payload = scheduledTrip({ originLabel: 'Quetzaltenango', destinationLabel: 'Petén' });
    trips.track(payload.tripId);
    const eventId = randomUUID();

    await bus.deliver('TripScheduled', payload, { eventId });
    await bus.deliver('TripScheduled', payload, { eventId });
    await bus.deliver('TripScheduled', payload);

    const copy = await prisma.trip.findUniqueOrThrow({ where: { tripId: payload.tripId } });
    expect(copy).toMatchObject({
      capacity: 40,
      busPlate: 'C482BTX',
      searchText: 'quetzaltenango peten c482btx',
    });
    expect(copy.ticketPrice.toNumber()).toBe(85);
    expect(copy.departureAt.toISOString()).toBe(payload.departureAt);
  });

  it('leaves rental trips out, since they sell no seats', async () => {
    const payload = scheduledTrip({
      type: 'RENTAL',
      routeId: null,
      ticketPrice: null,
      rentalId: randomUUID(),
    });

    await bus.deliver('TripScheduled', payload);

    expect(await prisma.trip.count({ where: { tripId: payload.tripId } })).toBe(0);
  });
});
