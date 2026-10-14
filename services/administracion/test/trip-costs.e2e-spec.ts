import { randomUUID } from 'node:crypto';
import { createEnvelope, exampleTripCompleted, tripCompletedPayloadSchema } from '@debus/contracts';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { createTestBranch } from './support/branches';
import { cleanTestData } from './support/cleanup';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64'), messageId: '1' },
  subscription: 'test',
});

describe('trip costs', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let branchId: string;
  const http = () => request(app.getHttpServer());

  const completed = (over: Record<string, unknown> = {}) =>
    tripCompletedPayloadSchema.parse({
      ...exampleTripCompleted,
      tripId: randomUUID(),
      busId: randomUUID(),
      branchId,
      ...over,
    });
  const send = (payload: unknown, eventId?: string) =>
    http()
      .post('/events/pubsub')
      .send(
        push({
          ...createEnvelope('TripCompleted', payload, 'c'),
          ...(eventId && { eventId }),
        }),
      )
      .expect(204);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    branchId = (await createTestBranch(prisma)).id;
  });
  afterAll(async () => {
    try {
      await cleanTestData(prisma);
    } finally {
      await app?.close();
    }
  });

  it('keeps the fuel, the depreciation and the driver pay fixed by the trip', async () => {
    const trip = completed();

    await send(trip);

    const cost = await prisma.tripCost.findUniqueOrThrow({ where: { tripId: trip.tripId } });
    expect(cost).toMatchObject({
      branchId,
      busId: trip.busId,
      tripType: 'REGULAR',
      distanceKm: 202,
    });
    expect(cost.arrivedAt.toISOString()).toBe(trip.arrivedAt);
    expect(Number(cost.fuelCost)).toBe(1250);
    expect(Number(cost.depreciationPerKm)).toBe(1.5);
    expect(Number(cost.depreciationAmount)).toBe(303);
    expect(Number(cost.driverPay)).toBe(350);
  });

  it('keeps one row when the same event is delivered twice', async () => {
    const trip = completed();
    const eventId = randomUUID();

    await send(trip, eventId);
    await send(trip, eventId);

    expect(await prisma.tripCost.count({ where: { tripId: trip.tripId } })).toBe(1);
  });

  it('keeps one row, and the first amounts, when the producer retries with a new event id', async () => {
    const trip = completed();

    await send(trip);
    await send({ ...trip, fuelCost: 9999 });

    const rows = await prisma.tripCost.findMany({ where: { tripId: trip.tripId } });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.fuelCost)).toBe(1250);
  });

  it('keeps the costs of a rental trip with its type', async () => {
    const trip = completed({ type: 'RENTAL', routeId: null });

    await send(trip);

    expect(
      await prisma.tripCost.findUniqueOrThrow({ where: { tripId: trip.tripId } }),
    ).toMatchObject({ tripType: 'RENTAL' });
  });
});
