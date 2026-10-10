import type { AccountLinkIssuedPayload } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, uniqueEmail } from './support/app';
import { activeAccount } from './support/accounts';
import { type EventCapture, captureEvents } from './support/events';

const branch = '9b2c7a10-1111-4c4c-8888-123456789abc';
// No account behind it: the service trusts the identity headers the gateway sets.
const callerId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const as = (id: string, role: string, branchId?: string) => ({
  'x-user-id': id,
  'x-user-role': role,
  ...(branchId && { 'x-branch-id': branchId }),
});

describe('users', () => {
  let app: INestApplication;
  let events: EventCapture;

  beforeAll(async () => {
    events = await captureEvents();
    app = await createTestApp();
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      await events?.close();
    }
  });

  it('lets a system admin create a branch admin who then sets their own password', async () => {
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const email = uniqueEmail('branch-admin');

    const created = await request(app.getHttpServer())
      .post('/users')
      .set(as(admin.id, 'SYSTEM_ADMIN'))
      .send({ fullName: 'Marta', email, role: 'BRANCH_ADMIN', branchId: branch, password: 'x' })
      .expect(201);

    expect(created.body).toMatchObject({ email, status: 'PENDING', branchId: branch });
    const stored = await app.get(PrismaService).user.findUnique({ where: { email } });
    expect(stored?.passwordHash).toBeNull();
    await events.next<AccountLinkIssuedPayload>(
      'EnlaceDeCuentaEmitido',
      (p) => p.email === email && p.reason === 'INVITATION',
    );
  });

  it('limits a branch admin to cashiers and drivers of their branch', async () => {
    const server = app.getHttpServer();
    const actor = as(callerId, 'BRANCH_ADMIN', branch);

    await request(server)
      .post('/users')
      .set(actor)
      .send({ fullName: 'Caja', email: uniqueEmail('cashier'), role: 'CASHIER', branchId: branch })
      .expect(201);
    await request(server)
      .post('/users')
      .set(actor)
      .send({ fullName: 'Jefe', email: uniqueEmail('boss'), role: 'SYSTEM_ADMIN' })
      .expect(403);
  });

  it('asks for a session and the right role', async () => {
    const body = { fullName: 'X', email: uniqueEmail('x'), role: 'CLIENT' };
    await request(app.getHttpServer()).post('/users').send(body).expect(401);
    await request(app.getHttpServer())
      .post('/users')
      .set(as(callerId, 'CLIENT'))
      .send(body)
      .expect(403);
  });

  it('deactivates without deleting and keeps the last system admin', async () => {
    const prisma = app.get(PrismaService);
    const cashier = await activeAccount(app, events, { role: 'CASHIER', branchId: branch });
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const server = app.getHttpServer();

    await request(server)
      .post(`/users/${cashier.id}/deactivate`)
      .set(as(admin.id, 'SYSTEM_ADMIN'))
      .expect(204);
    expect(await prisma.user.findUnique({ where: { id: cashier.id } })).toMatchObject({
      status: 'INACTIVE',
    });
    await request(server).post('/auth/login').send(cashier).expect(401);

    await withOnlyActiveAdmins(prisma, [admin.id], async () => {
      await request(server)
        .post(`/users/${admin.id}/deactivate`)
        .set(as(admin.id, 'SYSTEM_ADMIN'))
        .expect(409);
    });

    await request(server)
      .post(`/users/${cashier.id}/reactivate`)
      .set(as(admin.id, 'SYSTEM_ADMIN'))
      .expect(204);
    await request(server).post('/auth/login').send(cashier).expect(200);
  });

  it('keeps at least one system admin from the first boot', async () => {
    const admins = await app.get(PrismaService).user.count({
      where: { role: 'SYSTEM_ADMIN', status: { not: 'INACTIVE' } },
    });

    expect(admins).toBeGreaterThanOrEqual(1);
  });

  it('refuses a taken email and answers 404 for unknown users', async () => {
    const server = app.getHttpServer();
    const admin = as(callerId, 'SYSTEM_ADMIN');
    const client = (email: string) => ({
      fullName: 'Rosa',
      email,
      role: 'CLIENT',
      dpi: '2345678901234',
      phone: '55554444',
      nit: '1234567',
    });
    const email = uniqueEmail('first-client');

    await request(server).post('/users').set(admin).send(client(email)).expect(201);
    const sameEmail = await request(server).post('/users').set(admin).send(client(email));
    // A pending account does not hold the NIT, so another one with the same NIT is welcome.
    await request(server)
      .post('/users')
      .set(admin)
      .send(client(uniqueEmail('second-client')))
      .expect(201);

    expect(sameEmail.status).toBe(409);
    expect(sameEmail.body.message).toBe('Ya existe una cuenta con ese correo.');
    await request(server)
      .post('/users/11111111-2222-4333-8444-555555555555/deactivate')
      .set(admin)
      .expect(404);
    await request(server).post('/users/not-an-id/deactivate').set(admin).expect(400);
  });

  it('answers 409, never 500, to the loser of two simultaneous deactivations, round after round', async () => {
    const prisma = app.get(PrismaService);
    const first = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const second = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const ids = [first.id, second.id];
    await withOnlyActiveAdmins(prisma, ids, async () => {
      const server = app.getHttpServer();
      // The database only aborts one of the two transactions some of the time: repeat the race.
      for (let round = 0; round < 12; round += 1) {
        await prisma.user.updateMany({ where: { id: { in: ids } }, data: { status: 'ACTIVE' } });
        const responses = await Promise.all(
          ids.map((id) =>
            request(server).post(`/users/${id}/deactivate`).set(as(callerId, 'SYSTEM_ADMIN')),
          ),
        );

        expect(responses.map((response) => response.status).sort()).toEqual([204, 409]);
        const loser = responses.find((response) => response.status === 409);
        expect(loser?.body.message).toBe(
          'Debe quedar al menos un administrador del sistema activo.',
        );
        expect(await prisma.user.count({ where: { id: { in: ids }, status: 'ACTIVE' } })).toBe(1);
      }
    });
  });

  it('brings back a never activated account as pending', async () => {
    const server = app.getHttpServer();
    const admin = as(callerId, 'SYSTEM_ADMIN');
    const email = uniqueEmail('never-activated');
    const created = await request(server)
      .post('/users')
      .set(admin)
      .send({ fullName: 'Pedro', email, role: 'SYSTEM_ADMIN' })
      .expect(201);

    await request(server).post(`/users/${created.body.id}/deactivate`).set(admin).expect(204);
    await request(server).post(`/users/${created.body.id}/reactivate`).set(admin).expect(204);

    expect(await app.get(PrismaService).user.findUnique({ where: { email } })).toMatchObject({
      status: 'PENDING',
    });
  });
});

// Leaves only the given system admins active while `run` executes, then restores the rest.
async function withOnlyActiveAdmins(
  prisma: PrismaService,
  keepIds: string[],
  run: () => Promise<void>,
): Promise<void> {
  const others = await prisma.user.findMany({
    where: { role: 'SYSTEM_ADMIN', status: 'ACTIVE', id: { notIn: keepIds } },
  });
  const otherAdmins = { id: { in: others.map((other) => other.id) } };
  await prisma.user.updateMany({ where: otherAdmins, data: { status: 'INACTIVE' } });
  try {
    await run();
  } finally {
    await prisma.user.updateMany({ where: otherAdmins, data: { status: 'ACTIVE' } });
  }
}
