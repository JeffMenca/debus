import { randomUUID } from 'node:crypto';
import { availabilitySchema } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanFleetTestData } from './support/cleanup';
import { seedBusDriverAndRoute } from './support/fleet';

const window = {
  departureAt: '2030-03-10T12:00:00.000Z',
  estimatedArrivalAt: '2030-03-10T16:00:00.000Z',
};

describe('GET /internal/availability', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let branchId: string;

  const ask = (params: Record<string, string>) =>
    request(app.getHttpServer()).get('/internal/availability').query(params);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    branchId = await seedTestBranch(prisma, 'disponibilidad');
  });
  afterAll(async () => {
    await cleanFleetTestData(prisma);
    await app.close();
  });

  it('answers without a session: it is called between services', async () => {
    const { busId, driverId } = await seedBusDriverAndRoute(prisma, branchId);

    const response = await ask({ branchId, busId, driverId, ...window }).expect(200);

    expect(availabilitySchema.parse(response.body)).toEqual({
      bus: { available: true },
      driver: { available: true },
    });
  });

  it('says busy to both when a scheduled trip crosses, unless that trip is the one being moved', async () => {
    const { busId, driverId } = await seedBusDriverAndRoute(prisma, branchId);
    const trip = await prisma.tripCopy.create({
      data: {
        tripId: randomUUID(),
        busId,
        driverId,
        departureAt: new Date('2030-03-10T14:00:00.000Z'),
        estimatedArrivalAt: new Date('2030-03-10T18:00:00.000Z'),
        status: 'SCHEDULED',
      },
    });

    const busy = await ask({ branchId, busId, driverId, ...window }).expect(200);
    expect(busy.body).toEqual({
      bus: { available: false, reason: 'BUSY' },
      driver: { available: false, reason: 'BUSY' },
    });

    const moved = await ask({
      branchId,
      busId,
      driverId,
      ...window,
      ignoreTripId: trip.tripId,
    }).expect(200);
    expect(moved.body).toEqual({ bus: { available: true }, driver: { available: true } });

    await prisma.tripCopy.update({ where: { tripId: trip.tripId }, data: { status: 'COMPLETED' } });
    const done = await ask({ branchId, busId, driverId, ...window }).expect(200);
    expect(done.body.bus).toEqual({ available: true });
  });

  it('explains a bus in the workshop, an expired licence and another branch', async () => {
    const { busId, driverId } = await seedBusDriverAndRoute(prisma, branchId);
    await prisma.bus.update({ where: { id: busId }, data: { operationalStatus: 'IN_WORKSHOP' } });
    await prisma.driver.update({
      where: { id: driverId },
      data: { licenseExpiresOn: new Date('2030-03-09') },
    });

    const response = await ask({ branchId, busId, driverId, ...window }).expect(200);
    expect(response.body).toEqual({
      bus: { available: false, reason: 'IN_WORKSHOP' },
      driver: { available: false, reason: 'LICENSE_EXPIRED' },
    });

    const elsewhere = await ask({ branchId: randomUUID(), busId, driverId, ...window }).expect(200);
    expect(elsewhere.body).toEqual({
      bus: { available: false, reason: 'OTHER_BRANCH' },
      driver: { available: false, reason: 'OTHER_BRANCH' },
    });
  });

  it('says not found for a bus and a driver that flota does not have', async () => {
    const response = await ask({
      branchId,
      busId: randomUUID(),
      driverId: randomUUID(),
      ...window,
    }).expect(200);

    expect(response.body).toEqual({
      bus: { available: false, reason: 'NOT_FOUND' },
      driver: { available: false, reason: 'NOT_FOUND' },
    });
  });

  it('refuses a malformed question and an arrival before the departure', async () => {
    const { busId, driverId } = await seedBusDriverAndRoute(prisma, branchId);

    await ask({ branchId, busId, driverId }).expect(400);
    await ask({
      branchId,
      busId,
      driverId,
      departureAt: window.estimatedArrivalAt,
      estimatedArrivalAt: window.departureAt,
    }).expect(400);
  });
});
