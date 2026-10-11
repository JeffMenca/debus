import {
  type SettingsUpdatedPayload,
  settingsOverviewSchema,
  settingsVersionSchema,
  todayInGuatemala,
} from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { activeAccount } from './support/accounts';
import { createTestApp } from './support/app';
import { cleanTestData } from './support/cleanup';
import { type EventCapture, captureEvents } from './support/events';
import { identityHeaders } from './support/identity';

describe('settings', () => {
  let app: INestApplication;
  let events: EventCapture;

  beforeAll(async () => {
    events = await captureEvents();
    app = await createTestApp();
  });

  afterAll(async () => {
    try {
      await cleanTestData(app.get(PrismaService));
      await app?.close();
    } finally {
      await events?.close();
    }
  });

  it('schedules settings from today on and announces them', async () => {
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const headers = identityHeaders(admin.id, 'SYSTEM_ADMIN');
    const today = todayInGuatemala();
    const server = app.getHttpServer();

    const past = await request(server)
      .post('/settings')
      .set(headers)
      .send({ depreciationPerKm: 1.25, rentalRatePerKm: 12, effectiveFrom: '2020-01-01' })
      .expect(400);
    expect(past.body.message).toBe('La fecha de vigencia no puede ser anterior a hoy.');

    const created = await request(server)
      .post('/settings')
      .set(headers)
      .send({ depreciationPerKm: 1.35, rentalRatePerKm: 13.5, effectiveFrom: today })
      .expect(201);
    expect(settingsVersionSchema.parse(created.body)).toMatchObject({
      effectiveFrom: today,
      createdByName: 'Persona de prueba',
    });
    await events.next<SettingsUpdatedPayload>(
      'SettingsUpdated',
      (payload) => payload.versionId === created.body.id,
    );

    const overview = await request(server).get('/settings').set(headers).expect(200);
    expect(settingsOverviewSchema.parse(overview.body).current?.id).toBe(created.body.id);
  });

  it('keeps a future version in the history without making it the current one', async () => {
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const headers = identityHeaders(admin.id, 'SYSTEM_ADMIN');
    const server = app.getHttpServer();
    await request(server)
      .post('/settings')
      .set(headers)
      .send({ depreciationPerKm: 1.1, rentalRatePerKm: 11, effectiveFrom: todayInGuatemala() })
      .expect(201);

    const future = await request(server)
      .post('/settings')
      .set(headers)
      .send({ depreciationPerKm: 2, rentalRatePerKm: 20, effectiveFrom: '2099-01-01' })
      .expect(201);
    const overview = settingsOverviewSchema.parse(
      (await request(server).get('/settings').set(headers).expect(200)).body,
    );

    expect(overview.versions.map((version) => version.id)).toContain(future.body.id);
    expect(overview.current?.id).not.toBe(future.body.id);
  });

  it('refuses amounts with more than two decimals and missing fields', async () => {
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const headers = identityHeaders(admin.id, 'SYSTEM_ADMIN');
    const server = app.getHttpServer();

    await request(server)
      .post('/settings')
      .set(headers)
      .send({ depreciationPerKm: 1.255, rentalRatePerKm: 12, effectiveFrom: todayInGuatemala() })
      .expect(400);
    await request(server).post('/settings').set(headers).send({}).expect(400);
  });

  it('is only for system admins', async () => {
    const server = app.getHttpServer();
    const branchAdmin = identityHeaders('7c9e6679-7425-40de-944b-e07fc1f90ae7', 'BRANCH_ADMIN');

    await request(server).get('/settings').expect(401);
    await request(server).get('/settings').set(branchAdmin).expect(403);
    await request(server)
      .post('/settings')
      .set(branchAdmin)
      .send({ depreciationPerKm: 1, rentalRatePerKm: 2, effectiveFrom: todayInGuatemala() })
      .expect(403);
  });

  it('never changes a stored version', async () => {
    const prisma = app.get(PrismaService);
    const version = await prisma.settingsVersion.findFirstOrThrow();

    await expect(
      prisma.$executeRaw`UPDATE settings_versions SET rental_rate_per_km = 1 WHERE id = ${version.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`DELETE FROM settings_versions WHERE id = ${version.id}::uuid`,
    ).rejects.toThrow();
  });
});
