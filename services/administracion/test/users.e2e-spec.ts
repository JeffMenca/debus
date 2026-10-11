import { testEmail } from '@debus/config/test-data';
import type { AccountLinkSentPayload } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { activeAccount } from './support/accounts';
import { createTestBranch } from './support/branches';
import { cleanTestData } from './support/cleanup';
import { identityHeaders as as } from './support/identity';
import { type EventCapture, captureEvents } from './support/events';

// No account behind it: the service trusts the identity headers the gateway sets.
const callerId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('users', () => {
  let app: INestApplication;
  let events: EventCapture;
  let branch: string;

  beforeAll(async () => {
    events = await captureEvents();
    app = await createTestApp();
    branch = (await createTestBranch(app.get(PrismaService))).id;
  });

  afterAll(async () => {
    try {
      await cleanTestData(app.get(PrismaService));
      await app?.close();
    } finally {
      await events?.close();
    }
  });

  it('lets a system admin create a branch admin who then sets their own password', async () => {
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const email = testEmail('branch-admin');

    const created = await request(app.getHttpServer())
      .post('/users')
      .set(as(admin.id, 'SYSTEM_ADMIN'))
      .send({ fullName: 'Marta', email, role: 'BRANCH_ADMIN', branchId: branch, password: 'x' })
      .expect(201);

    expect(created.body).toMatchObject({ email, status: 'PENDING', branchId: branch });
    const stored = await app.get(PrismaService).user.findUnique({ where: { email } });
    expect(stored?.passwordHash).toBeNull();
    await events.next<AccountLinkSentPayload>(
      'AccountLinkSent',
      (p) => p.email === email && p.reason === 'INVITATION',
    );
  });

  it('limits a branch admin to cashiers and drivers of their branch', async () => {
    const server = app.getHttpServer();
    const actor = as(callerId, 'BRANCH_ADMIN', branch);

    await request(server)
      .post('/users')
      .set(actor)
      .send({ fullName: 'Caja', email: testEmail('cashier'), role: 'CASHIER', branchId: branch })
      .expect(201);
    await request(server)
      .post('/users')
      .set(actor)
      .send({ fullName: 'Jefe', email: testEmail('boss'), role: 'SYSTEM_ADMIN' })
      .expect(403);
  });

  it('only links staff to branches that exist', async () => {
    await expect(
      app.get(PrismaService).user.create({
        data: {
          email: testEmail('orphan'),
          fullName: 'Sin sucursal',
          role: 'CASHIER',
          branchId: '00000000-0000-4000-8000-000000000000',
        },
      }),
    ).rejects.toThrow();
  });

  it('asks for a session and the right role', async () => {
    const body = { fullName: 'X', email: testEmail('x'), role: 'CLIENT' };
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
    const email = testEmail('first-client');

    await request(server).post('/users').set(admin).send(client(email)).expect(201);
    const sameEmail = await request(server).post('/users').set(admin).send(client(email));
    // A pending account does not hold the NIT, so another one with the same NIT is welcome.
    await request(server)
      .post('/users')
      .set(admin)
      .send(client(testEmail('second-client')))
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
      // Races only show up some of the time: repeat them.
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

  it('lets exactly one system admin survive when several are deactivated at once, round after round', async () => {
    const prisma = app.get(PrismaService);
    const admins = await Promise.all(
      Array.from({ length: 4 }, () => activeAccount(app, events, { role: 'SYSTEM_ADMIN' })),
    );
    const ids = admins.map((account) => account.id);
    await withOnlyActiveAdmins(prisma, ids, async () => {
      const server = app.getHttpServer();
      for (let round = 0; round < 30; round += 1) {
        await prisma.user.updateMany({ where: { id: { in: ids } }, data: { status: 'ACTIVE' } });
        const responses = await Promise.all(
          ids.map((id) =>
            request(server).post(`/users/${id}/deactivate`).set(as(callerId, 'SYSTEM_ADMIN')),
          ),
        );

        const losers = responses.filter((response) => response.status !== 204);
        expect(losers.map((loser) => [loser.status, loser.body.message])).toEqual([
          [409, 'Debe quedar al menos un administrador del sistema activo.'],
        ]);
        expect(await prisma.user.count({ where: { id: { in: ids }, status: 'ACTIVE' } })).toBe(1);
      }
    });
  });

  it('brings back a never activated account as pending', async () => {
    const server = app.getHttpServer();
    const admin = as(callerId, 'SYSTEM_ADMIN');
    const email = testEmail('never-activated');
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

  it('keeps at least one admin linked to every active branch', async () => {
    const prisma = app.get(PrismaService);
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const headers = as(admin.id, 'SYSTEM_ADMIN');
    const ownBranch = await createTestBranch(prisma);
    const only = await activeAccount(app, events, { role: 'BRANCH_ADMIN', branchId: ownBranch.id });
    const server = app.getHttpServer();

    const refused = await request(server)
      .post(`/users/${only.id}/deactivate`)
      .set(headers)
      .expect(409);
    expect(refused.body.message).toBe('La sucursal debe conservar al menos un administrador.');

    await request(server)
      .post('/users')
      .set(headers)
      .send({
        fullName: 'Segunda Admin',
        email: testEmail('second-admin'),
        role: 'BRANCH_ADMIN',
        branchId: ownBranch.id,
      })
      .expect(201);
    await request(server).post(`/users/${only.id}/deactivate`).set(headers).expect(204);
  });

  it('lets exactly one of two admins of a branch be deactivated at once, round after round', async () => {
    const prisma = app.get(PrismaService);
    const ownBranch = await createTestBranch(prisma);
    const first = await activeAccount(app, events, {
      role: 'BRANCH_ADMIN',
      branchId: ownBranch.id,
    });
    const second = await activeAccount(app, events, {
      role: 'BRANCH_ADMIN',
      branchId: ownBranch.id,
    });
    const ids = [first.id, second.id];
    const server = app.getHttpServer();

    for (let round = 0; round < 12; round += 1) {
      await prisma.user.updateMany({ where: { id: { in: ids } }, data: { status: 'ACTIVE' } });
      const responses = await Promise.all(
        ids.map((id) =>
          request(server).post(`/users/${id}/deactivate`).set(as(callerId, 'SYSTEM_ADMIN')),
        ),
      );

      expect(responses.map((response) => response.status).sort()).toEqual([204, 409]);
      expect(await prisma.user.count({ where: { id: { in: ids }, status: 'ACTIVE' } })).toBe(1);
    }
  });

  it('resends an invitation until the hourly limit', async () => {
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const headers = as(admin.id, 'SYSTEM_ADMIN');
    const email = testEmail('resend');
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/users')
      .set(headers)
      .send({ fullName: 'Ana Sic', email, role: 'CASHIER', branchId: branch })
      .expect(201);

    // The invitation itself is the first of three links allowed per hour.
    await request(server).post(`/users/${created.body.id}/invitation`).set(headers).expect(202);
    await request(server).post(`/users/${created.body.id}/invitation`).set(headers).expect(202);
    const limited = await request(server)
      .post(`/users/${created.body.id}/invitation`)
      .set(headers)
      .expect(429);

    expect(limited.body.message).toBe(
      'Ya enviamos varios correos a esta cuenta. Intenta de nuevo en una hora.',
    );
    expect(
      await events.count<AccountLinkSentPayload>(
        'AccountLinkSent',
        (payload) => payload.email === email,
      ),
    ).toBe(3);
  });

  it('refuses to invite staff into an inactive branch and to resend to an active account', async () => {
    const prisma = app.get(PrismaService);
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const headers = as(admin.id, 'SYSTEM_ADMIN');
    const inactive = await createTestBranch(prisma, { active: false });
    const active = await activeAccount(app, events, { role: 'CASHIER', branchId: branch });
    const server = app.getHttpServer();

    const refused = await request(server)
      .post('/users')
      .set(headers)
      .send({
        fullName: 'Ana Sic',
        email: testEmail('inactive-branch'),
        role: 'CASHIER',
        branchId: inactive.id,
      })
      .expect(400);
    await request(server).post(`/users/${active.id}/invitation`).set(headers).expect(409);

    expect(refused.body.message).toBe('Elige una sucursal activa.');
  });

  it('lists with filters and keeps a branch admin inside their own branch', async () => {
    const prisma = app.get(PrismaService);
    const server = app.getHttpServer();
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const ownBranch = await createTestBranch(prisma);
    const otherBranch = await createTestBranch(prisma);
    const marker = `find-${Date.now()}`;
    const mine = await prisma.user.create({
      data: {
        email: testEmail(`${marker}-mine`),
        fullName: 'Mía',
        role: 'CASHIER',
        branchId: ownBranch.id,
      },
    });
    const theirs = await prisma.user.create({
      data: {
        email: testEmail(`${marker}-theirs`),
        fullName: 'Suya',
        role: 'CASHIER',
        branchId: otherBranch.id,
      },
    });
    const idsOf = (response: request.Response) =>
      response.body.items.map((user: { id: string }) => user.id);

    const all = await request(server)
      .get(`/users?role=CASHIER&q=${marker}`)
      .set(as(admin.id, 'SYSTEM_ADMIN'))
      .expect(200);
    const scoped = await request(server)
      .get(`/users?q=${marker}`)
      .set(as(callerId, 'BRANCH_ADMIN', ownBranch.id))
      .expect(200);

    expect(idsOf(all).sort()).toEqual([mine.id, theirs.id].sort());
    expect(idsOf(scoped)).toEqual([mine.id]);
    await request(server)
      .get(`/users/${theirs.id}`)
      .set(as(callerId, 'BRANCH_ADMIN', ownBranch.id))
      .expect(404);
    await request(server)
      .get(`/users/${mine.id}`)
      .set(as(callerId, 'BRANCH_ADMIN', ownBranch.id))
      .expect(200);
    await request(server)
      .get('/users')
      .set(as(callerId, 'CASHIER', ownBranch.id))
      .expect(403);
    await request(server).get('/users?role=BOSS').set(as(admin.id, 'SYSTEM_ADMIN')).expect(400);
  });

  it('pages the list in a stable order with the tab counts of the whole filter', async () => {
    const prisma = app.get(PrismaService);
    const server = app.getHttpServer();
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const marker = `page-${Date.now()}`;
    const names = ['Ana', 'Beto', 'Ceci', 'Dora', 'Elsa'];
    for (const [index, name] of names.entries()) {
      await prisma.user.create({
        data: {
          email: testEmail(`${marker}-${index}`),
          fullName: name,
          role: 'DRIVER',
          status: index === 0 ? 'ACTIVE' : 'PENDING',
        },
      });
    }
    const pageOf = (query: string) =>
      request(server)
        .get(`/users?q=${marker}&${query}`)
        .set(as(admin.id, 'SYSTEM_ADMIN'))
        .expect(200);
    const namesOf = (response: request.Response) =>
      response.body.items.map((user: { fullName: string }) => user.fullName);

    const first = await pageOf('pageSize=2&page=1');
    const third = await pageOf('pageSize=2&page=3');
    const pending = await pageOf('pageSize=2&status=PENDING');

    expect(first.body).toMatchObject({ total: 5, page: 1, pageSize: 2 });
    expect(namesOf(first)).toEqual(['Ana', 'Beto']);
    expect(namesOf(third)).toEqual(['Elsa']);
    expect(pending.body.total).toBe(4);
    expect(pending.body.summary.statusCounts).toEqual({ ACTIVE: 1, PENDING: 4, INACTIVE: 0 });
    await request(server).get('/users?pageSize=101').set(as(admin.id, 'SYSTEM_ADMIN')).expect(400);
    await request(server).get('/users?page=0').set(as(admin.id, 'SYSTEM_ADMIN')).expect(400);
  });

  it('finds people without minding accents and names their branch', async () => {
    const prisma = app.get(PrismaService);
    const server = app.getHttpServer();
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const named = await createTestBranch(prisma);
    const marker = `acc${Date.now()}`;
    await prisma.user.create({
      data: {
        email: testEmail(marker),
        fullName: `José Pérez ${marker}`,
        role: 'CASHIER',
        branchId: named.id,
      },
    });

    const found = await request(server)
      .get(`/users?q=${encodeURIComponent(`jose perez ${marker}`)}`)
      .set(as(admin.id, 'SYSTEM_ADMIN'))
      .expect(200);
    const accented = await request(server)
      .get(`/users?q=${encodeURIComponent(`JOSÉ PÉREZ ${marker}`)}`)
      .set(as(admin.id, 'SYSTEM_ADMIN'))
      .expect(200);

    expect(found.body.items).toHaveLength(1);
    expect(found.body.items[0].branchName).toBe(named.name);
    expect(accented.body.total).toBe(1);
  });

  it('treats % and _ in the search as literal characters', async () => {
    const prisma = app.get(PrismaService);
    const server = app.getHttpServer();
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const marker = `lit${Date.now()}`;
    await prisma.user.create({
      data: { email: testEmail(marker), fullName: `Literal 100% ${marker}`, role: 'CASHIER' },
    });
    const search = (q: string) =>
      request(server)
        .get(`/users?q=${encodeURIComponent(q)}`)
        .set(as(admin.id, 'SYSTEM_ADMIN'));

    expect((await search(`100% ${marker}`).expect(200)).body.total).toBe(1);
    expect((await search(`100_ ${marker}`).expect(200)).body.total).toBe(0);
    expect((await search(`%${marker}`).expect(200)).body.total).toBe(0);
    expect((await search('%').expect(200)).body.total).toBeLessThan(
      (await request(server).get('/users').set(as(admin.id, 'SYSTEM_ADMIN'))).body.total,
    );
  });

  it('splits staff from clients with the group filter', async () => {
    const prisma = app.get(PrismaService);
    const server = app.getHttpServer();
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const marker = `grp-${Date.now()}`;
    await prisma.user.create({
      data: { email: testEmail(`${marker}-staff`), fullName: 'Equipo', role: 'DRIVER' },
    });
    await prisma.user.create({
      data: { email: testEmail(`${marker}-client`), fullName: 'Cliente', role: 'CLIENT' },
    });
    const totalOf = async (group: string) =>
      (
        await request(server)
          .get(`/users?q=${marker}&group=${group}`)
          .set(as(admin.id, 'SYSTEM_ADMIN'))
          .expect(200)
      ).body.total;

    expect(await totalOf('staff')).toBe(1);
    expect(await totalOf('clients')).toBe(1);
  });

  it('edits the name and moves staff, but never the last admin of a branch', async () => {
    const prisma = app.get(PrismaService);
    const server = app.getHttpServer();
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const headers = as(admin.id, 'SYSTEM_ADMIN');
    const fromBranch = await createTestBranch(prisma);
    const toBranch = await createTestBranch(prisma);
    const cashier = await activeAccount(app, events, { role: 'CASHIER', branchId: fromBranch.id });
    const only = await activeAccount(app, events, {
      role: 'BRANCH_ADMIN',
      branchId: fromBranch.id,
    });

    const renamed = await request(server)
      .patch(`/users/${cashier.id}`)
      .set(headers)
      .send({ fullName: 'Ana Sic' })
      .expect(200);
    const moved = await request(server)
      .patch(`/users/${cashier.id}`)
      .set(headers)
      .send({ branchId: toBranch.id })
      .expect(200);
    const refused = await request(server)
      .patch(`/users/${only.id}`)
      .set(headers)
      .send({ branchId: toBranch.id })
      .expect(409);
    await request(server)
      .patch(`/users/${admin.id}`)
      .set(headers)
      .send({ branchId: toBranch.id })
      .expect(400);
    await request(server).patch(`/users/${cashier.id}`).set(headers).send({}).expect(400);
    await request(server)
      .patch(`/users/${cashier.id}`)
      .set(as(callerId, 'BRANCH_ADMIN', fromBranch.id))
      .send({ fullName: 'Otra' })
      .expect(403);

    expect(renamed.body.fullName).toBe('Ana Sic');
    expect(moved.body.branchId).toBe(toBranch.id);
    expect(refused.body.message).toBe('La sucursal debe conservar al menos un administrador.');
  });

  it('does not bring staff back into an inactive branch', async () => {
    const prisma = app.get(PrismaService);
    const server = app.getHttpServer();
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const ownBranch = await createTestBranch(prisma);
    const cashier = await activeAccount(app, events, { role: 'CASHIER', branchId: ownBranch.id });
    await request(server)
      .post(`/users/${cashier.id}/deactivate`)
      .set(as(admin.id, 'SYSTEM_ADMIN'))
      .expect(204);
    await prisma.branch.update({ where: { id: ownBranch.id }, data: { active: false } });

    const response = await request(server)
      .post(`/users/${cashier.id}/reactivate`)
      .set(as(admin.id, 'SYSTEM_ADMIN'))
      .expect(409);

    expect(response.body.message).toBe('Elige una sucursal activa.');
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
