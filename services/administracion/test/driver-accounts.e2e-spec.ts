import { randomUUID } from 'node:crypto';
import { testEmail } from '@debus/config/test-data';
import {
  type AccountLinkSentPayload,
  createEnvelope,
  driverChangedPayloadSchema,
  exampleDriver,
} from '@debus/contracts';
import { type INestApplication, Logger } from '@nestjs/common';
import request from 'supertest';
import { identityHeaders } from '@debus/server';
import { PrismaService } from '../src/prisma/prisma.service';
import { activeAccount } from './support/accounts';
import { createTestApp } from './support/app';
import { createTestBranch } from './support/branches';
import { cleanTestData } from './support/cleanup';
import { type EventCapture, captureEvents } from './support/events';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64'), messageId: '1' },
  subscription: 'test',
});

describe('driver accounts', () => {
  let app: INestApplication;
  let events: EventCapture;
  let prisma: PrismaService;
  let branchId: string;
  const http = () => request(app.getHttpServer());

  const snapshot = (over: Record<string, unknown> = {}) =>
    driverChangedPayloadSchema.parse({
      ...exampleDriver,
      driverId: randomUUID(),
      email: testEmail('driver'),
      branchId,
      ...over,
    });
  const send = (type: 'DriverAdded' | 'DriverUpdated', payload: unknown, eventId?: string) =>
    http()
      .post('/events/pubsub')
      .send(push({ ...createEnvelope(type, payload, 'c'), ...(eventId && { eventId }) }))
      .expect(204);
  const flush = () => http().post('/outbox/flush').expect(200);

  beforeAll(async () => {
    events = await captureEvents();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    branchId = (await createTestBranch(prisma)).id;
  });
  afterAll(async () => {
    try {
      await cleanTestData(prisma);
      await app?.close();
    } finally {
      await events?.close();
    }
  });

  it('opens the account of a new driver with its own id and sends the link to create a password', async () => {
    const driver = snapshot();

    await send('DriverAdded', driver);
    await flush();

    expect(await prisma.user.findUnique({ where: { id: driver.driverId } })).toMatchObject({
      email: driver.email,
      role: 'DRIVER',
      status: 'PENDING',
      branchId,
      fullName: driver.fullName,
      driverVersion: 1,
    });
    expect(await prisma.accountLink.count({ where: { userId: driver.driverId } })).toBe(1);
    const sent = await events.next<AccountLinkSentPayload>(
      'AccountLinkSent',
      (payload) => payload.email === driver.email,
    );
    expect(sent).toMatchObject({ userId: driver.driverId, reason: 'INVITATION' });
  });

  it('handles the same event twice as one account and one link', async () => {
    const driver = snapshot();
    const eventId = randomUUID();

    await send('DriverAdded', driver, eventId);
    await send('DriverAdded', driver, eventId);

    expect(await prisma.user.count({ where: { id: driver.driverId } })).toBe(1);
    expect(await prisma.accountLink.count({ where: { userId: driver.driverId } })).toBe(1);
  });

  it('deactivates the account and ends its sessions, then reopens it', async () => {
    const driver = snapshot();
    await send('DriverAdded', driver);
    await prisma.refreshToken.create({
      data: {
        userId: driver.driverId,
        familyId: randomUUID(),
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    await send('DriverUpdated', { ...driver, active: false, version: 2 });

    expect(await prisma.user.findUnique({ where: { id: driver.driverId } })).toMatchObject({
      status: 'INACTIVE',
      driverVersion: 2,
    });
    expect(
      await prisma.refreshToken.count({ where: { userId: driver.driverId, revokedAt: null } }),
    ).toBe(0);

    await send('DriverUpdated', { ...driver, active: true, version: 3 });
    expect(await prisma.user.findUnique({ where: { id: driver.driverId } })).toMatchObject({
      status: 'PENDING',
      driverVersion: 3,
    });
  });

  it('brings back an account with a password as active', async () => {
    const driver = snapshot();
    await send('DriverAdded', driver);
    await prisma.user.update({
      where: { id: driver.driverId },
      data: { passwordHash: 'hash', status: 'ACTIVE' },
    });
    await send('DriverUpdated', { ...driver, active: false, version: 2 });

    await send('DriverUpdated', { ...driver, active: true, version: 3 });

    expect((await prisma.user.findUnique({ where: { id: driver.driverId } }))?.status).toBe(
      'ACTIVE',
    );
  });

  it('follows the newest snapshot even when an old one arrives afterwards', async () => {
    const driver = snapshot();

    await send('DriverUpdated', { ...driver, fullName: 'Nombre nuevo', version: 2 });
    await send('DriverAdded', { ...driver, fullName: 'Nombre viejo', version: 1 });

    expect(await prisma.user.findUnique({ where: { id: driver.driverId } })).toMatchObject({
      fullName: 'Nombre nuevo',
      driverVersion: 2,
    });
  });

  it('opens no account when the email belongs to another one, and says so in the log', async () => {
    const client = await activeAccount(app, events, { role: 'CLIENT' });
    const driver = snapshot({ email: client.email });

    // The testing module silences warnings, so the call itself is what is observed.
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await send('DriverAdded', driver);

    expect(warn).toHaveBeenCalledWith(
      { driverId: driver.driverId },
      expect.stringContaining('already belongs to another account'),
    );
    warn.mockRestore();
    expect(await prisma.user.findUnique({ where: { id: driver.driverId } })).toBeNull();
    expect((await prisma.user.findUnique({ where: { id: client.id } }))?.role).toBe('CLIENT');
  });

  it('keeps the account when a new email is taken by another one', async () => {
    const client = await activeAccount(app, events, { role: 'CLIENT' });
    const driver = snapshot();
    await send('DriverAdded', driver);

    await send('DriverUpdated', {
      ...driver,
      email: client.email,
      fullName: 'Con otro correo',
      version: 2,
    });

    expect(await prisma.user.findUnique({ where: { id: driver.driverId } })).toMatchObject({
      email: driver.email,
      fullName: 'Con otro correo',
      driverVersion: 2,
    });
  });

  it('does not let a driver be invited from users, nor edited, deactivated or reactivated there', async () => {
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const system = identityHeaders(admin.id, 'SYSTEM_ADMIN');
    const driver = snapshot();
    await send('DriverAdded', driver);
    const managed = 'Los choferes se gestionan desde Flota › Choferes.';

    await http()
      .post('/users')
      .set(system)
      .send({ fullName: 'Chofer', email: testEmail('x'), role: 'DRIVER', branchId })
      .expect(400);
    for (const [method, path, body] of [
      ['patch', `/users/${driver.driverId}`, { fullName: 'Otro' }],
      ['post', `/users/${driver.driverId}/deactivate`, {}],
      ['post', `/users/${driver.driverId}/reactivate`, {}],
      ['post', `/users/${driver.driverId}/invitation`, {}],
    ] as const) {
      const response = await http()[method](path).set(system).send(body).expect(409);
      expect(response.body.message).toBe(managed);
    }
    expect((await prisma.user.findUnique({ where: { id: driver.driverId } }))?.fullName).toBe(
      driver.fullName,
    );
  });
});
