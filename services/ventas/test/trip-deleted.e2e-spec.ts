import { randomUUID } from 'node:crypto';
import { exampleTripDeleted, refundRequestedPayloadSchema } from '@debus/contracts';
import { InMemoryEventBus } from '@debus/messaging';
import { identityHeaders } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { testClients } from './support/clients';
import { type TestTrips, scheduledTrip, testTrips } from './support/trips';

const REFUNDS = `
  SELECT envelope->'payload' AS payload FROM outbox
  WHERE type = 'RefundRequested' AND envelope->'payload'->>'tripId' = $1
  ORDER BY envelope->'payload'->>'ticketId'`;
const FORGET_REFUNDS = `
  DELETE FROM outbox
  WHERE type = 'RefundRequested' AND envelope->'payload'->>'tripId' = ANY($1::text[])`;

type PurchaseState = { status: 'PENDING' | 'CONFIRMED'; debitAttempts: number };

describe('a trip deleted in viajes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let trips: TestTrips;
  let clients: ReturnType<typeof testClients>;
  const deletedTrips: string[] = [];
  const purchases: string[] = [];

  const deleted = (tripId: string) => {
    deletedTrips.push(tripId);
    return { ...exampleTripDeleted, tripId };
  };

  // An online purchase with its ticket and seat, as the saga leaves it at each step.
  async function onlinePurchase(tripId: string, seat: number, state: PurchaseState) {
    const clientId = await clients.create();
    const id = randomUUID();
    purchases.push(id);
    await prisma.$transaction([
      prisma.ticket.create({
        data: {
          id,
          tripId,
          status: state.status,
          channel: 'ONLINE',
          clientId,
          nit: '45218376',
          buyerName: 'Ana López',
          unitPrice: 85,
          total: 85,
          paidOn: new Date('2026-10-21T00:00:00.000Z'),
          seats: { create: { tripId, seatNumber: seat } },
        },
      }),
      prisma.purchase.create({
        data: {
          id,
          clientId,
          tripId,
          seats: [seat],
          amount: 85,
          description: `Boleto, asiento ${seat}`,
          paidOn: new Date('2026-10-21T00:00:00.000Z'),
          payBy: new Date(Date.now() + 600_000),
          ...state,
        },
      }),
    ]);
    return { id, clientId };
  }

  const refundsOf = async (tripId: string) =>
    (await prisma.$queryRawUnsafe<{ payload: Record<string, unknown> }[]>(REFUNDS, tripId)).map(
      (row) => row.payload,
    );

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    bus = InMemoryEventBus.attach(app);
    trips = testTrips(prisma);
    clients = testClients(prisma);
  });
  afterAll(async () => {
    await prisma.$executeRawUnsafe(FORGET_REFUNDS, deletedTrips);
    await prisma.purchase.deleteMany({ where: { id: { in: purchases } } });
    await prisma.deletedTrip.deleteMany({ where: { tripId: { in: deletedTrips } } });
    await trips.cleanUp();
    await clients.cleanUp();
    await app.close();
  });

  it('drops its tickets and seats, closes its purchases and asks to refund what may have been charged', async () => {
    const tripId = await trips.create();
    const confirmed = await onlinePurchase(tripId, 3, { status: 'CONFIRMED', debitAttempts: 1 });
    const inDoubt = await onlinePurchase(tripId, 4, { status: 'PENDING', debitAttempts: 1 });
    const neverCharged = await onlinePurchase(tripId, 5, { status: 'PENDING', debitAttempts: 0 });
    const counter = await trips.ticket(tripId, { nit: '45218376' });
    const eventId = randomUUID();

    await bus.deliver('TripDeleted', deleted(tripId), { eventId });
    await bus.deliver('TripDeleted', deleted(tripId), { eventId });

    expect(await prisma.trip.count({ where: { tripId } })).toBe(0);
    expect(await prisma.ticket.count({ where: { tripId } })).toBe(0);
    expect(await prisma.ticketSeat.count({ where: { tripId } })).toBe(0);
    const closed = await prisma.purchase.findMany({ where: { tripId } });
    expect(closed).toHaveLength(3);
    for (const purchase of closed) {
      expect(purchase).toMatchObject({ status: 'FAILED', failure: 'TRIP_CANCELLED' });
    }

    const refunds = await refundsOf(tripId);
    expect(refunds.map((payload) => refundRequestedPayloadSchema.parse(payload))).toEqual(
      [confirmed, inDoubt]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(({ id, clientId }) =>
          expect.objectContaining({ ticketId: id, clientId, nit: '45218376', amount: 85 }),
        ),
    );
    const refunded = refunds.map((payload) => payload.ticketId);
    expect(refunded).not.toContain(neverCharged.id);
    expect(refunded).not.toContain(counter);
  });

  it('answers the closed purchase to its buyer with what happened to the money', async () => {
    const tripId = await trips.create();
    const confirmed = await onlinePurchase(tripId, 7, { status: 'CONFIRMED', debitAttempts: 1 });

    await bus.deliver('TripDeleted', deleted(tripId));
    const response = await request(app.getHttpServer())
      .get(`/purchases/${confirmed.id}`)
      .set(identityHeaders(confirmed.clientId, 'CLIENT'))
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'FAILED',
      failure: 'TRIP_CANCELLED',
      message: 'Este viaje se canceló. Si ya se te había cobrado, el dinero vuelve a tu cartera.',
      ticket: null,
    });
  });

  it('never puts on sale a trip whose deletion arrived before its copy', async () => {
    const trip = scheduledTrip();

    await bus.deliver('TripDeleted', deleted(trip.tripId));
    await bus.deliver('TripScheduled', trip);

    expect(await prisma.trip.count({ where: { tripId: trip.tripId } })).toBe(0);
    expect(await refundsOf(trip.tripId)).toEqual([]);
  });

  it('leaves alone the trips of a rental, which ventas never copied', async () => {
    const tripId = await trips.create();

    await bus.deliver('TripDeleted', { ...deleted(tripId), type: 'RENTAL' });

    expect(await prisma.trip.count({ where: { tripId } })).toBe(1);
  });
});
