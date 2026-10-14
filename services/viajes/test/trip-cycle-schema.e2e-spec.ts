import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { cleanTripTestData } from './support/cleanup';
import { seedFleet } from './support/fleet';

describe('trip departures and arrivals are immutable', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tripId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const fleet = await seedFleet(prisma, 'inmutables');
    const trip = await prisma.trip.create({
      data: {
        type: 'REGULAR',
        status: 'COMPLETED',
        branchId: fleet.branchId,
        routeId: fleet.routeId,
        busId: fleet.busId,
        busPlate: 'C482BTX',
        capacity: 40,
        driverId: fleet.driverId,
        driverName: 'Chofer de Prueba',
        originLabel: 'Origen',
        destinationLabel: 'Destino',
        departureAt: new Date('2030-01-01T12:00:00Z'),
        estimatedArrivalAt: new Date('2030-01-01T16:00:00Z'),
        createdById: randomUUID(),
        departure: {
          create: {
            departedAt: new Date('2030-01-01T12:05:00Z'),
            startMileageKm: 1000,
            recordedById: randomUUID(),
            recordedByRole: 'BRANCH_ADMIN',
          },
        },
        arrival: {
          create: {
            arrivedAt: new Date('2030-01-01T16:10:00Z'),
            endMileageKm: 1200,
            fuelCost: 900,
            distanceKm: 200,
            depreciationPerKm: 0.85,
            depreciationAmount: 170,
            driverPay: 300,
            settingsVersionId: randomUUID(),
            recordedById: randomUUID(),
            recordedByRole: 'DRIVER',
          },
        },
      },
    });
    tripId = trip.id;
  });

  afterAll(async () => {
    await cleanTripTestData(prisma);
    await app.close();
  });

  it.each([
    [
      'UPDATE trip_departures SET start_mileage_km = 1 WHERE trip_id = $1::uuid',
      'trip departures cannot be changed',
    ],
    ['DELETE FROM trip_departures WHERE trip_id = $1::uuid', 'trip departures cannot be changed'],
    [
      'UPDATE trip_arrivals SET fuel_cost = 1 WHERE trip_id = $1::uuid',
      'trip arrivals cannot be changed',
    ],
    ['DELETE FROM trip_arrivals WHERE trip_id = $1::uuid', 'trip arrivals cannot be changed'],
  ])('refuses %s', async (sql, message) => {
    await expect(prisma.$executeRawUnsafe(sql, tripId)).rejects.toThrow(message);
  });

  it('refuses to delete a trip that has a departure', async () => {
    await expect(prisma.trip.delete({ where: { id: tripId } })).rejects.toThrow();
  });

  it('lets the test cleanup remove them, with the trigger back on afterwards', async () => {
    await cleanTripTestData(prisma);

    expect(await prisma.tripDeparture.count({ where: { tripId } })).toBe(0);
    expect(await prisma.tripArrival.count({ where: { tripId } })).toBe(0);
    expect(await prisma.trip.count({ where: { id: tripId } })).toBe(0);
    const triggers = await prisma.$queryRawUnsafe<{ name: string; enabled: string }[]>(
      `SELECT tgname AS name, tgenabled::text AS enabled FROM pg_trigger
       WHERE tgname IN ('trip_departures_immutable', 'trip_arrivals_immutable')`,
    );
    expect(triggers.map((trigger) => trigger.enabled)).toEqual(['O', 'O']);
  });
});

describe('a rental request keeps its search text', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanTripTestData(prisma);
    await app.close();
  });

  it('folds the client, the NIT and both places without accents, and the cleanup removes it', async () => {
    const fleet = await seedFleet(prisma, 'texto de alquiler');
    const request = await prisma.rentalRequest.create({
      data: {
        id: randomUUID(),
        branchId: fleet.branchId,
        clientName: 'José Pérez',
        nit: '1234567-8',
        originLabel: 'Quetzaltenango',
        destinationLabel: 'Petén',
        departureAt: new Date('2030-01-01T12:00:00Z'),
        passengers: 30,
        distanceKm: 300,
        price: 4500,
      },
    });

    expect(request.searchText).toContain('jose perez');
    expect(request.searchText).toContain('peten');
    expect(request.searchText).toContain('1234567-8');

    await cleanTripTestData(prisma);
    expect(await prisma.rentalRequest.count({ where: { id: request.id } })).toBe(0);
  });
});
