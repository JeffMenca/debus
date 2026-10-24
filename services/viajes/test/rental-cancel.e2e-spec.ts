import { randomUUID } from 'node:crypto';
import {
  type RentalCancelledPayload,
  type TripDeletedPayload,
  createEnvelope,
  exampleRentalPaid,
  rentalToAssignSchema,
} from '@debus/contracts';
import { FakeServiceClient, identityHeaders, ServiceHttpClient } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { cleanTripTestData } from './support/cleanup';
import { captureEvents } from './support/events';
import { type SeededFleet, seedBus, seedDriver, seedFleet } from './support/fleet';
import { departureOf } from './support/trip-records';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64'), messageId: '1' },
  subscription: 'test',
});

describe('cancelling a paid rental (pivot of the cancellation saga)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let events: ReturnType<typeof captureEvents>;
  let fleet: SeededFleet;
  const flota = new FakeServiceClient();
  const http = () => request(app.getHttpServer());
  const admin = () => identityHeaders(randomUUID(), 'BRANCH_ADMIN', fleet.branchId);
  const cancel = (rentalId: string) =>
    http().post(`/rental-requests/${rentalId}/cancel`).set(admin());

  const paidRental = async (): Promise<string> => {
    const rentalId = randomUUID();
    const payload = {
      ...exampleRentalPaid,
      rentalId,
      branchId: fleet.branchId,
      departureAt: '2030-08-24T13:00:00.000Z',
      returnAt: '2030-08-24T23:00:00.000Z',
    };
    await http()
      .post('/events/pubsub')
      .send(push(createEnvelope('RentalPaid', payload, 'c')))
      .expect(204);
    return rentalId;
  };
  const assigned = async (): Promise<{ rentalId: string; tripId: string }> => {
    const rentalId = await paidRental();
    const { body } = await http()
      .post(`/rental-requests/${rentalId}/assignment`)
      .set(admin())
      .send({
        busId: await seedBus(prisma, fleet.branchId),
        driverId: await seedDriver(prisma, fleet.branchId),
        estimatedArrivalAt: '2030-08-24T23:30:00.000Z',
      })
      .expect(201);
    return { rentalId, tripId: body.id };
  };
  const cancellationsOf = async (rentalId: string) =>
    (await events.committed<RentalCancelledPayload>('RentalCancelled')).filter(
      (event) => event.rentalId === rentalId,
    );

  // Waits until a session of this database is blocked on a lock while running that statement.
  const untilWaiting = async (statement: string) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const [{ waiting }] = await prisma.$queryRawUnsafe<[{ waiting: number }]>(
        `SELECT count(*)::int AS waiting FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE $1`,
        `${statement}%`,
      );
      if (waiting > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`nothing waited on: ${statement}`);
  };

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(ServiceHttpClient).useValue(flota),
    );
    prisma = app.get(PrismaService);
    events = captureEvents(app, prisma);
    fleet = await seedFleet(prisma, 'cancelar alquiler');
    flota.respond('flota', 'GET', '/internal/availability', {
      bus: { available: true },
      driver: { available: true },
    });
  });
  afterAll(async () => {
    await cleanTripTestData(prisma);
    await app.close();
  });

  it('cancels a rental still waiting for its bus and announces it once', async () => {
    const rentalId = await paidRental();

    const { body } = await cancel(rentalId).expect(201);
    await cancel(rentalId).expect(201);

    expect(rentalToAssignSchema.parse(body)).toMatchObject({ status: 'CANCELLED', tripId: null });
    expect(await cancellationsOf(rentalId)).toEqual([
      { rentalId, branchId: fleet.branchId, tripId: null, cancelledAt: expect.any(String) },
    ]);
    const pending = await http().get('/rental-requests?pageSize=100').set(admin()).expect(200);
    expect(pending.body.items.map((item: { id: string }) => item.id)).not.toContain(rentalId);
  });

  it('deletes the trip it was given, so flota frees the bus', async () => {
    const { rentalId, tripId } = await assigned();

    await cancel(rentalId).expect(201);

    expect(await prisma.trip.count({ where: { id: tripId } })).toBe(0);
    const deleted = await events.committed<TripDeletedPayload>('TripDeleted');
    expect(deleted.filter((event) => event.tripId === tripId)).toEqual([
      expect.objectContaining({ tripId, type: 'RENTAL', branchId: fleet.branchId }),
    ]);
    expect(await cancellationsOf(rentalId)).toEqual([expect.objectContaining({ tripId })]);
  });

  it('refuses once the trip left, and keeps everything as it was', async () => {
    const { rentalId, tripId } = await assigned();
    await prisma.tripDeparture.create({ data: { tripId, ...departureOf() } });
    await prisma.trip.update({ where: { id: tripId }, data: { status: 'IN_TRANSIT' } });

    const { body } = await cancel(rentalId).expect(409);

    expect(body.message).toBe('El viaje de este alquiler ya salió. Ya no se puede cancelar.');
    expect(await prisma.trip.count({ where: { id: tripId } })).toBe(1);
    expect(await cancellationsOf(rentalId)).toEqual([]);
  });

  it('asks to wait for a payment it has not received, and hides other branches', async () => {
    const { body } = await cancel(randomUUID()).expect(404);
    expect(body.message).toContain('Todavía estamos registrando el pago');

    const rentalId = await paidRental();
    const other = identityHeaders(randomUUID(), 'BRANCH_ADMIN', randomUUID());
    await http().post(`/rental-requests/${rentalId}/cancel`).set(other).expect(404);
    await http()
      .post(`/rental-requests/${rentalId}/cancel`)
      .set(identityHeaders(randomUUID(), 'CLIENT'))
      .expect(403);
  });

  it('asks to try again when the trip was deleted while it waited, without a deadlock', async () => {
    const { rentalId, tripId } = await assigned();

    let release: () => void = () => {};
    let markLocked: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const locked = new Promise<void>((resolve) => (markLocked = resolve));
    // Deletes the trip the way DELETE /trips does (trip first, then the rental), and commits only
    // once the cancellation is waiting on the trip: the order is forced, not left to timing.
    const deleting = prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe('SELECT id FROM trips WHERE id = $1::uuid FOR UPDATE', tripId);
        await tx.trip.delete({ where: { id: tripId } });
        await tx.rentalRequest.update({
          where: { id: rentalId },
          data: { status: 'PENDING', tripId: null },
        });
        markLocked();
        await held;
      },
      { timeout: 20_000 },
    );
    await locked;
    const answer = cancel(rentalId).then((response) => response);
    await untilWaiting('SELECT id FROM trips WHERE id');
    release();
    await deleting;

    expect((await answer).status).toBe(409);
    expect(await cancellationsOf(rentalId)).toEqual([]);
    await cancel(rentalId).expect(201);
    expect(await cancellationsOf(rentalId)).toEqual([expect.objectContaining({ tripId: null })]);
  });

  // Holds the rental row in a transaction that applies `change`, and commits only once `run` is
  // waiting on that lock: the order of the race is forced, not left to timing.
  async function whileHeld<T>(
    rentalId: string,
    change: (tx: Prisma.TransactionClient) => Promise<unknown>,
    run: () => Promise<T>,
  ): Promise<T> {
    let release: () => void = () => {};
    let markLocked: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const locked = new Promise<void>((resolve) => (markLocked = resolve));
    const holding = prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          'SELECT id FROM rental_requests WHERE id = $1::uuid FOR UPDATE',
          rentalId,
        );
        await change(tx);
        markLocked();
        await held;
      },
      { timeout: 20_000 },
    );
    await locked;
    const answer = run();
    await untilWaiting('SELECT id FROM rental_requests WHERE id');
    release();
    await holding;
    return answer;
  }

  it('lets an assignment waiting behind a cancellation find the rental cancelled', async () => {
    const rentalId = await paidRental();
    const body = {
      busId: await seedBus(prisma, fleet.branchId),
      driverId: await seedDriver(prisma, fleet.branchId),
      estimatedArrivalAt: '2030-08-24T23:30:00.000Z',
    };

    const answer = await whileHeld(
      rentalId,
      (tx) =>
        tx.rentalRequest.update({
          where: { id: rentalId },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        }),
      () =>
        http()
          .post(`/rental-requests/${rentalId}/assignment`)
          .set(admin())
          .send(body)
          .then((response) => response),
    );

    expect(answer.status).toBe(409);
    expect(answer.body.message).toBe('Este alquiler fue cancelado. Ya no se le asigna bus.');
    expect(await prisma.trip.count({ where: { rentalId } })).toBe(0);
  });

  it('asks a cancellation waiting behind an assignment to try again, and then deletes that trip', async () => {
    const rentalId = await paidRental();
    const busId = await seedBus(prisma, fleet.branchId);
    const driverId = await seedDriver(prisma, fleet.branchId);
    const tripId = randomUUID();

    const answer = await whileHeld(
      rentalId,
      async (tx) => {
        await tx.trip.create({
          data: {
            id: tripId,
            type: 'RENTAL',
            status: 'SCHEDULED',
            branchId: fleet.branchId,
            routeId: null,
            busId,
            busPlate: 'Z100ABC',
            capacity: 40,
            driverId,
            driverName: 'Chofer de Prueba',
            originLabel: 'Quetzaltenango',
            destinationLabel: 'Panajachel',
            departureAt: new Date('2030-08-24T13:00:00.000Z'),
            estimatedArrivalAt: new Date('2030-08-24T23:30:00.000Z'),
            ticketPrice: null,
            rentalId,
            createdById: randomUUID(),
          },
        });
        await tx.rentalRequest.update({
          where: { id: rentalId },
          data: { status: 'ASSIGNED', tripId },
        });
      },
      () => cancel(rentalId).then((response) => response),
    );

    expect(answer.status).toBe(409);
    expect(await cancellationsOf(rentalId)).toEqual([]);
    await cancel(rentalId).expect(201);
    expect(await prisma.trip.count({ where: { id: tripId } })).toBe(0);
    expect(await cancellationsOf(rentalId)).toEqual([expect.objectContaining({ tripId })]);
  });
});
