import { randomUUID } from 'node:crypto';
import {
  createEnvelope,
  exampleRentalPaid,
  rentalRequestPageSchema,
  tripScheduledPayloadSchema,
  tripSchema,
} from '@debus/contracts';
import { FakeServiceClient, identityHeaders, ServiceHttpClient } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { cleanTripTestData } from './support/cleanup';
import { captureEvents } from './support/events';
import { type SeededFleet, seedBus, seedDriver, seedFleet } from './support/fleet';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64'), messageId: '1' },
  subscription: 'test',
});

describe('rentals waiting for a bus and a driver', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let events: ReturnType<typeof captureEvents>;
  let fleet: SeededFleet;
  const flota = new FakeServiceClient();
  const http = () => request(app.getHttpServer());
  const admin = () => identityHeaders(randomUUID(), 'BRANCH_ADMIN', fleet.branchId);
  const paid = (over: Record<string, unknown> = {}) => ({
    ...exampleRentalPaid,
    rentalId: randomUUID(),
    branchId: fleet.branchId,
    departureAt: '2030-07-24T13:00:00.000Z',
    returnAt: '2030-07-24T23:00:00.000Z',
    ...over,
  });
  const sendPaid = (payload: unknown, eventId?: string) =>
    http()
      .post('/events/pubsub')
      .send(push({ ...createEnvelope('RentalPaid', payload, 'c'), ...(eventId && { eventId }) }))
      .expect(204);
  const assignment = async () => ({
    busId: await seedBus(prisma, fleet.branchId),
    driverId: await seedDriver(prisma, fleet.branchId),
    estimatedArrivalAt: '2030-07-24T23:00:00.000Z',
  });

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(ServiceHttpClient).useValue(flota),
    );
    prisma = app.get(PrismaService);
    events = captureEvents(app, prisma);
    fleet = await seedFleet(prisma, 'alquileres');
    flota.respond('flota', 'GET', '/internal/availability', {
      bus: { available: true },
      driver: { available: true },
    });
  });
  afterAll(async () => {
    await cleanTripTestData(prisma);
    await app.close();
  });

  it('keeps a paid rental once even if the event is delivered twice', async () => {
    const payload = paid();
    const eventId = randomUUID();

    await sendPaid(payload, eventId);
    await sendPaid(payload, eventId);
    await sendPaid(payload);

    const rows = await prisma.rentalRequest.findMany({ where: { id: payload.rentalId } });
    expect(rows).toEqual([
      expect.objectContaining({
        branchId: fleet.branchId,
        clientName: 'Colegio San José',
        status: 'PENDING',
        tripId: null,
      }),
    ]);
    expect(rows[0]?.searchText).toContain('colegio san jose');
  });

  it('lists the pending rentals of the branch, filtered, and keeps them from a driver', async () => {
    const payload = paid({ clientName: 'Excursión Única Pérez' });
    await sendPaid(payload);
    const other = await seedFleet(prisma, 'alquileres otra');
    await sendPaid(paid({ branchId: other.branchId }));

    const all = await http().get('/rental-requests?pageSize=100').set(admin()).expect(200);
    const found = await http().get('/rental-requests?q=excursion%20unica').set(admin()).expect(200);

    const page = rentalRequestPageSchema.parse(all.body);
    expect(page.items.every((item) => item.branchId === fleet.branchId)).toBe(true);
    expect(page.items.map((item) => item.id)).toContain(payload.rentalId);
    expect(found.body.items.map((item: { id: string }) => item.id)).toEqual([payload.rentalId]);
    await http()
      .get('/rental-requests')
      .set(identityHeaders(randomUUID(), 'DRIVER', fleet.branchId))
      .expect(403);
    await http().get('/rental-requests?status=OTHER').set(admin()).expect(400);
  });

  it('assigns a bus and a driver once, and publishes TripScheduled for the rental', async () => {
    const payload = paid();
    await sendPaid(payload);
    const body = await assignment();

    const response = await http()
      .post(`/rental-requests/${payload.rentalId}/assignment`)
      .set(admin())
      .send(body)
      .expect(201);

    expect(tripSchema.parse(response.body)).toMatchObject({
      type: 'RENTAL',
      status: 'SCHEDULED',
      routeId: null,
      ticketPrice: null,
      busId: body.busId,
      driverId: body.driverId,
      originName: 'Quetzaltenango',
      destinationName: 'Panajachel',
      departureAt: payload.departureAt,
      estimatedArrivalAt: body.estimatedArrivalAt,
    });
    const row = await prisma.rentalRequest.findUniqueOrThrow({ where: { id: payload.rentalId } });
    expect(row).toMatchObject({ status: 'ASSIGNED', tripId: response.body.id });
    const scheduled = (await events.committed('TripScheduled')).map((event) =>
      tripScheduledPayloadSchema.parse(event),
    );
    expect(scheduled).toContainEqual(
      expect.objectContaining({
        tripId: response.body.id,
        type: 'RENTAL',
        rentalId: payload.rentalId,
        routeId: null,
        ticketPrice: null,
      }),
    );

    const again = await http()
      .post(`/rental-requests/${payload.rentalId}/assignment`)
      .set(admin())
      .send(await assignment())
      .expect(409);
    expect(again.body.message).toBe('Ese alquiler ya tiene bus y chofer.');
    expect(await prisma.trip.count({ where: { rentalId: payload.rentalId } })).toBe(1);
    const assigned = await http().get('/rental-requests?status=ASSIGNED').set(admin()).expect(200);
    expect(assigned.body.items.map((item: { id: string }) => item.id)).toContain(payload.rentalId);
  });

  it('sends the rental back to be assigned when its trip is deleted', async () => {
    const payload = paid();
    await sendPaid(payload);
    const response = await http()
      .post(`/rental-requests/${payload.rentalId}/assignment`)
      .set(admin())
      .send(await assignment())
      .expect(201);

    await http().delete(`/trips/${response.body.id}`).set(admin()).expect(204);

    expect(await prisma.trip.count({ where: { id: response.body.id } })).toBe(0);
    const pending = await http().get('/rental-requests?pageSize=100').set(admin()).expect(200);
    expect(pending.body.items).toContainEqual(
      expect.objectContaining({ id: payload.rentalId, status: 'PENDING', tripId: null }),
    );
    await http()
      .post(`/rental-requests/${payload.rentalId}/assignment`)
      .set(admin())
      .send(await assignment())
      .expect(201);
  });

  it('refuses a bus that is too small, a bus that is busy and a rental of another branch', async () => {
    const payload = paid({ passengers: 60 });
    await sendPaid(payload);
    const small = await http()
      .post(`/rental-requests/${payload.rentalId}/assignment`)
      .set(admin())
      .send(await assignment())
      .expect(409);
    expect(small.body.message).toBe('Ese bus tiene menos asientos que pasajeros del alquiler.');

    const busy = paid();
    await sendPaid(busy);
    const body = await assignment();
    const first = paid();
    await sendPaid(first);
    await http()
      .post(`/rental-requests/${first.rentalId}/assignment`)
      .set(admin())
      .send(body)
      .expect(201);
    const clash = await http()
      .post(`/rental-requests/${busy.rentalId}/assignment`)
      .set(admin())
      .send({ ...body, driverId: (await assignment()).driverId })
      .expect(409);
    expect(clash.body.message).toBe('Ese bus ya tiene un viaje en ese horario.');

    await http()
      .post(`/rental-requests/${busy.rentalId}/assignment`)
      .set(identityHeaders(randomUUID(), 'BRANCH_ADMIN', randomUUID()))
      .send(await assignment())
      .expect(404);
    await http()
      .post(`/rental-requests/${randomUUID()}/assignment`)
      .set(admin())
      .send(await assignment())
      .expect(404);
    await http()
      .post(`/rental-requests/${busy.rentalId}/assignment`)
      .set(admin())
      .send({ busId: 'x' })
      .expect(400);
    await http()
      .post(`/rental-requests/${busy.rentalId}/assignment`)
      .set(admin())
      .send({ ...(await assignment()), estimatedArrivalAt: '2030-07-24T12:00:00.000Z' })
      .expect(409);
  });

  it('keeps the bus with the client until the return of a round trip', async () => {
    const payload = paid();
    await sendPaid(payload);

    const early = await http()
      .post(`/rental-requests/${payload.rentalId}/assignment`)
      .set(admin())
      .send({ ...(await assignment()), estimatedArrivalAt: '2030-07-24T22:59:00.000Z' })
      .expect(409);

    expect(early.body.message).toMatch(/no puede ser antes del regreso del cliente/);
    expect(await prisma.trip.count({ where: { rentalId: payload.rentalId } })).toBe(0);
    await http()
      .post(`/rental-requests/${payload.rentalId}/assignment`)
      .set(admin())
      .send(await assignment())
      .expect(201);
  });

  it('assigns a rental again after its late trip is deleted, as long as the arrival is ahead', async () => {
    const payload = paid({ returnAt: null });
    await sendPaid(payload);
    const first = await http()
      .post(`/rental-requests/${payload.rentalId}/assignment`)
      .set(admin())
      .send(await assignment())
      .expect(201);
    // The hour of departure passes and the bus never leaves.
    const past = new Date(Date.now() - 3_600_000);
    await prisma.trip.update({ where: { id: first.body.id }, data: { departureAt: past } });
    await prisma.rentalRequest.update({
      where: { id: payload.rentalId },
      data: { departureAt: past },
    });

    await http().delete(`/trips/${first.body.id}`).set(admin()).expect(204);
    expect(
      (await prisma.rentalRequest.findUniqueOrThrow({ where: { id: payload.rentalId } })).status,
    ).toBe('PENDING');
    const stale = await http()
      .post(`/rental-requests/${payload.rentalId}/assignment`)
      .set(admin())
      .send({
        ...(await assignment()),
        estimatedArrivalAt: new Date(Date.now() - 60_000).toISOString(),
      })
      .expect(409);
    expect(stale.body.message).toMatch(/llegada estimada ya pasó/);
    const again = await http()
      .post(`/rental-requests/${payload.rentalId}/assignment`)
      .set(admin())
      .send({
        ...(await assignment()),
        estimatedArrivalAt: new Date(Date.now() + 3 * 3_600_000).toISOString(),
      })
      .expect(201);

    expect(tripSchema.parse(again.body)).toMatchObject({ type: 'RENTAL', status: 'SCHEDULED' });
    expect(await prisma.trip.count({ where: { rentalId: payload.rentalId } })).toBe(1);
  });

  it('sends a rental assigned late on its way now, so a bus busy at the old hour can take it', async () => {
    const hour = 3_600_000;
    const payload = paid({
      departureAt: new Date(Date.now() - 6 * hour).toISOString(),
      returnAt: new Date(Date.now() - 2 * hour).toISOString(),
    });
    await sendPaid(payload);
    const busId = await seedBus(prisma, fleet.branchId);
    await prisma.trip.create({
      data: {
        type: 'REGULAR',
        status: 'SCHEDULED',
        branchId: fleet.branchId,
        busId,
        busPlate: 'Z100BCD',
        capacity: 40,
        driverId: randomUUID(),
        driverName: 'Ana Sic',
        originLabel: 'Prueba A',
        destinationLabel: 'Prueba B',
        departureAt: new Date(Date.now() - 5 * hour),
        estimatedArrivalAt: new Date(Date.now() - 3 * hour),
        ticketPrice: 85,
        createdById: randomUUID(),
      },
    });
    const startedAt = Date.now();

    const response = await http()
      .post(`/rental-requests/${payload.rentalId}/assignment`)
      .set(admin())
      .send({
        ...(await assignment()),
        busId,
        estimatedArrivalAt: new Date(Date.now() + 4 * hour).toISOString(),
      })
      .expect(201);

    const departure = new Date(response.body.departureAt);
    expect(departure.getTime()).toBeGreaterThan(startedAt);
    expect(departure.getTime() % 60_000).toBe(0);
    const scheduled = (await events.committed('TripScheduled')).map((event) =>
      tripScheduledPayloadSchema.parse(event),
    );
    expect(scheduled).toContainEqual(
      expect.objectContaining({ tripId: response.body.id, departureAt: response.body.departureAt }),
    );
    const request = await prisma.rentalRequest.findUniqueOrThrow({
      where: { id: payload.rentalId },
    });
    expect(request.departureAt.toISOString()).toBe(payload.departureAt);
  });

  it('lets exactly one of several simultaneous assignments of one rental win', async () => {
    const payload = paid();
    await sendPaid(payload);
    const bodies = await Promise.all(Array.from({ length: 5 }, assignment));

    const results = await Promise.all(
      bodies.map((body) =>
        http().post(`/rental-requests/${payload.rentalId}/assignment`).set(admin()).send(body),
      ),
    );

    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect(results.filter((result) => result.status === 409)).toHaveLength(4);
    expect(await prisma.trip.count({ where: { rentalId: payload.rentalId } })).toBe(1);
  });
});
