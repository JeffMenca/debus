import { TEST_BRANCH_PREFIX, TEST_RUN, testEmail } from '@debus/config/test-data';
import {
  type AccountLinkSentPayload,
  type BranchChangedPayload,
  branchChangedPayloadSchema,
  branchSchema,
  branchWithAdminsSchema,
} from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { activeAccount } from './support/accounts';
import { createTestApp, tokenOf } from './support/app';
import { branchFields, createTestBranch, uniqueBranchName } from './support/branches';
import { cleanTestData } from './support/cleanup';
import { type EventCapture, captureEvents } from './support/events';
import { identityHeaders } from './support/identity';

describe('branches', () => {
  let app: INestApplication;
  let events: EventCapture;
  let prisma: PrismaService;

  beforeAll(async () => {
    events = await captureEvents();
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      await cleanTestData(prisma);
      await app?.close();
    } finally {
      await events?.close();
    }
  });

  it('creates a branch with its first admin, who receives the invitation and signs in to that branch', async () => {
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const email = testEmail('first-admin');
    const body = { ...branchFields(), admin: { fullName: 'Luis Ramírez', email } };

    const created = await request(app.getHttpServer())
      .post('/branches')
      .set(identityHeaders(admin.id, 'SYSTEM_ADMIN'))
      .send(body)
      .expect(201);

    expect(branchWithAdminsSchema.parse(created.body)).toMatchObject({
      code: body.code,
      active: true,
      version: 1,
      admins: [{ email, status: 'PENDING' }],
    });
    const event = await events.next<BranchChangedPayload>(
      'BranchCreated',
      (payload) => payload.branchId === created.body.id,
    );
    expect(branchChangedPayloadSchema.parse(event)).toMatchObject({ code: body.code, version: 1 });
    const link = await events.next<AccountLinkSentPayload>(
      'AccountLinkSent',
      (payload) => payload.email === email,
    );
    expect(link.reason).toBe('INVITATION');

    await request(app.getHttpServer())
      .post('/auth/password')
      .send({ token: tokenOf(link.link!), password: 'clave-segura-1' })
      .expect(204);
    const session = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'clave-segura-1' })
      .expect(200);
    expect(session.body.user).toMatchObject({ role: 'BRANCH_ADMIN', branchId: created.body.id });
  });

  it('creates nothing when the admin email is taken', async () => {
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const body = { ...branchFields(), admin: { fullName: 'Repetido', email: admin.email } };

    const response = await request(app.getHttpServer())
      .post('/branches')
      .set(identityHeaders(admin.id, 'SYSTEM_ADMIN'))
      .send(body)
      .expect(409);

    expect(response.body.message).toBe('Ya existe una cuenta con ese correo.');
    expect(await prisma.branch.count({ where: { name: body.name } })).toBe(0);
  });

  it('answers the loser of two branches created with the same admin email with the email message, round after round', async () => {
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const headers = identityHeaders(admin.id, 'SYSTEM_ADMIN');
    const server = app.getHttpServer();

    for (let round = 0; round < 6; round += 1) {
      const email = testEmail('shared-admin');
      const responses = await Promise.all(
        [0, 1].map(() =>
          request(server)
            .post('/branches')
            .set(headers)
            .send({ ...branchFields(), admin: { fullName: 'Repetido', email } }),
        ),
      );

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      const loser = responses.find((response) => response.status === 409)!;
      expect(loser.body.message).toBe('Ya existe una cuenta con ese correo.');
    }
  });

  it('refuses a repeated code, a repeated name and invalid bodies', async () => {
    const server = app.getHttpServer();
    const actor = identityHeaders(
      (await activeAccount(app, events, { role: 'SYSTEM_ADMIN' })).id,
      'SYSTEM_ADMIN',
    );
    const existing = await createTestBranch(prisma);
    const newAdmin = () => ({ fullName: 'Ana Sic', email: testEmail('admin') });

    const sameCode = await request(server)
      .post('/branches')
      .set(actor)
      .send({ ...branchFields(), code: existing.code, admin: newAdmin() })
      .expect(409);
    const sameName = await request(server)
      .post('/branches')
      .set(actor)
      .send({ ...branchFields(), name: existing.name, admin: newAdmin() })
      .expect(409);
    await request(server).post('/branches').set(actor).send(branchFields()).expect(400);
    await request(server)
      .post('/branches')
      .set(actor)
      .send({ ...branchFields(), latitude: 19.43, longitude: -99.13, admin: newAdmin() })
      .expect(400);

    expect(sameCode.body.message).toBe('Ya existe una sucursal con ese código.');
    expect(sameName.body.message).toBe('Ya existe una sucursal con ese nombre.');
  });

  it('only lets a system admin create branches, and only with a session', async () => {
    const server = app.getHttpServer();
    const body = { ...branchFields(), admin: { fullName: 'Ana Sic', email: testEmail('admin') } };

    await request(server).post('/branches').send(body).expect(401);
    await request(server)
      .post('/branches')
      .set(identityHeaders('7c9e6679-7425-40de-944b-e07fc1f90ae7', 'BRANCH_ADMIN'))
      .send(body)
      .expect(403);
  });

  it('hides inactive branches unless a system admin asks for them', async () => {
    const server = app.getHttpServer();
    const active = await createTestBranch(prisma);
    const inactive = await createTestBranch(prisma, { active: false });
    const userId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    const q = `q=${encodeURIComponent(TEST_BRANCH_PREFIX + TEST_RUN)}&pageSize=100`;
    const idsOf = (response: request.Response) =>
      response.body.items.map((b: { id: string }) => b.id);

    const plain = await request(server)
      .get(`/branches?${q}`)
      .set(identityHeaders(userId, 'SYSTEM_ADMIN'))
      .expect(200);
    const all = await request(server)
      .get(`/branches?status=all&${q}`)
      .set(identityHeaders(userId, 'SYSTEM_ADMIN'))
      .expect(200);
    const asCashier = await request(server)
      .get(`/branches?status=all&${q}`)
      .set(identityHeaders(userId, 'CASHIER', active.id))
      .expect(200);
    const legacyFlag = await request(server)
      .get(`/branches?includeInactive=true&${q}`)
      .set(identityHeaders(userId, 'SYSTEM_ADMIN'))
      .expect(200);

    expect(idsOf(plain)).toContain(active.id);
    expect(idsOf(plain)).not.toContain(inactive.id);
    expect(idsOf(all)).toEqual(expect.arrayContaining([active.id, inactive.id]));
    expect(idsOf(asCashier)).not.toContain(inactive.id);
    expect(idsOf(legacyFlag)).not.toContain(inactive.id);
    await request(server).get('/branches').expect(401);
  });

  it('pages branches in name order with the counts of the tabs', async () => {
    const server = app.getHttpServer();
    const marker = `pag${Date.now()}`;
    const sysAdmin = identityHeaders('7c9e6679-7425-40de-944b-e07fc1f90ae7', 'SYSTEM_ADMIN');
    const created = [];
    for (const label of ['c', 'a', 'b']) {
      created.push(await createTestBranch(prisma, { name: uniqueBranchName(`${marker}${label}`) }));
    }
    const pageOf = (query: string, headers = sysAdmin) =>
      request(server).get(`/branches?q=${marker}&${query}`).set(headers).expect(200);
    const namesOf = (response: request.Response) =>
      response.body.items.map((b: { name: string }) => b.name);

    const first = await pageOf('status=all&pageSize=2');
    const second = await pageOf('status=all&pageSize=2&page=2');
    await request(server).post(`/branches/${created[0]!.id}/deactivate`).set(sysAdmin).expect(204);
    const afterDeactivating = await pageOf('status=inactive');
    const asCashier = await pageOf(
      'status=all',
      identityHeaders('7c9e6679-7425-40de-944b-e07fc1f90ae7', 'CASHIER', created[1]!.id),
    );

    expect(first.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(namesOf(first)).toHaveLength(2);
    expect(namesOf(first)).toEqual([...namesOf(first)].sort());
    expect(namesOf(second)).toHaveLength(1);
    expect(afterDeactivating.body.total).toBe(1);
    expect(afterDeactivating.body.summary.statusCounts).toEqual({ active: 2, inactive: 1 });
    expect(asCashier.body.total).toBe(2);
    expect(asCashier.body.summary.statusCounts.inactive).toBe(0);
    expect(JSON.stringify(asCashier.body)).not.toContain('admins');
    await request(server).get('/branches?pageSize=101').set(sysAdmin).expect(400);
  });

  it('finds a branch by place without minding accents', async () => {
    const server = app.getHttpServer();
    const sysAdmin = identityHeaders('7c9e6679-7425-40de-944b-e07fc1f90ae7', 'SYSTEM_ADMIN');
    const branch = await createTestBranch(prisma, { department: 'Petén', municipality: 'Flores' });

    const found = await request(server)
      .get(`/branches?q=${encodeURIComponent(`${branch.code} Flores PETÉN`)}`)
      .set(sysAdmin)
      .expect(200);

    expect(found.body.items.map((b: { id: string }) => b.id)).toEqual([branch.id]);
  });

  it('keeps the personal data of branch admins away from every role but the system admin', async () => {
    const server = app.getHttpServer();
    const sysAdmin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const branch = await createTestBranch(prisma);
    const staff = await activeAccount(app, events, { role: 'BRANCH_ADMIN', branchId: branch.id });
    const userId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    const staffEmail = (await prisma.user.findUniqueOrThrow({ where: { id: staff.id } })).email;
    const bodyOf = (response: request.Response) => JSON.stringify(response.body);

    const asAdmin = await request(server)
      .get(`/branches?q=${encodeURIComponent(branch.name)}`)
      .set(identityHeaders(sysAdmin.id, 'SYSTEM_ADMIN'))
      .expect(200);
    const detailAsAdmin = await request(server)
      .get(`/branches/${branch.id}`)
      .set(identityHeaders(sysAdmin.id, 'SYSTEM_ADMIN'))
      .expect(200);
    const asClient = await request(server)
      .get(`/branches?q=${encodeURIComponent(branch.name)}`)
      .set(identityHeaders(userId, 'CLIENT'))
      .expect(200);
    const asCashier = await request(server)
      .get(`/branches?q=${encodeURIComponent(branch.name)}`)
      .set(identityHeaders(userId, 'CASHIER', branch.id))
      .expect(200);
    const detailAsCashier = await request(server)
      .get(`/branches/${branch.id}`)
      .set(identityHeaders(userId, 'CASHIER', branch.id))
      .expect(200);
    const detailAsBranchAdmin = await request(server)
      .get(`/branches/${branch.id}`)
      .set(identityHeaders(staff.id, 'BRANCH_ADMIN', branch.id))
      .expect(200);

    const listed = (response: request.Response) =>
      response.body.items.find((b: { id: string }) => b.id === branch.id);
    expect(listed(asAdmin).admins).toEqual([expect.objectContaining({ email: staffEmail })]);
    expect(detailAsAdmin.body.admins).toEqual([expect.objectContaining({ email: staffEmail })]);
    for (const response of [asClient, asCashier, detailAsCashier, detailAsBranchAdmin]) {
      expect(bodyOf(response)).not.toContain(staffEmail);
      expect(bodyOf(response)).not.toContain('admins');
    }
    expect(listed(asClient)).toMatchObject({ id: branch.id, name: branch.name, code: branch.code });
    expect(branchSchema.parse(listed(asCashier)).id).toBe(branch.id);
  });

  it('shows a branch to its own staff and to system admins only', async () => {
    const server = app.getHttpServer();
    const branch = await createTestBranch(prisma);
    const other = await createTestBranch(prisma);
    const userId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

    await request(server)
      .get(`/branches/${branch.id}`)
      .set(identityHeaders(userId, 'CASHIER', branch.id))
      .expect(200);
    await request(server)
      .get(`/branches/${branch.id}`)
      .set(identityHeaders(userId, 'CASHIER', other.id))
      .expect(403);
    await request(server)
      .get(`/branches/${branch.id}`)
      .set(identityHeaders(userId, 'SYSTEM_ADMIN'))
      .expect(200);
    await request(server)
      .get('/branches/11111111-2222-4333-8444-555555555555')
      .set(identityHeaders(userId, 'SYSTEM_ADMIN'))
      .expect(404);
    await request(server)
      .get('/branches/not-an-id')
      .set(identityHeaders(userId, 'SYSTEM_ADMIN'))
      .expect(400);
  });

  it('publishes every change as BranchUpdated with a higher version', async () => {
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const headers = identityHeaders(admin.id, 'SYSTEM_ADMIN');
    const branch = await createTestBranch(prisma);
    await activeAccount(app, events, { role: 'BRANCH_ADMIN', branchId: branch.id });
    const server = app.getHttpServer();

    const updated = await request(server)
      .patch(`/branches/${branch.id}`)
      .set(headers)
      .send({ phone: '7761-0000' })
      .expect(200);
    expect(updated.body).toMatchObject({ phone: '77610000', version: 2 });
    await events.next<BranchChangedPayload>(
      'BranchUpdated',
      (payload) => payload.branchId === branch.id && payload.version === 2,
    );

    await request(server).post(`/branches/${branch.id}/deactivate`).set(headers).expect(204);
    await request(server).post(`/branches/${branch.id}/deactivate`).set(headers).expect(204);
    expect(
      await events.count<BranchChangedPayload>(
        'BranchUpdated',
        (payload) => payload.branchId === branch.id && !payload.active,
      ),
    ).toBe(1);

    await request(server).post(`/branches/${branch.id}/reactivate`).set(headers).expect(204);
    await events.next<BranchChangedPayload>(
      'BranchUpdated',
      (payload) => payload.branchId === branch.id && payload.active && payload.version === 4,
    );
  });

  it('refuses empty changes and codes of other branches', async () => {
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const headers = identityHeaders(admin.id, 'SYSTEM_ADMIN');
    const branch = await createTestBranch(prisma);
    const other = await createTestBranch(prisma);
    const server = app.getHttpServer();

    await request(server).patch(`/branches/${branch.id}`).set(headers).send({}).expect(400);
    const taken = await request(server)
      .patch(`/branches/${branch.id}`)
      .set(headers)
      .send({ code: other.code })
      .expect(409);
    await request(server)
      .patch(`/branches/${branch.id}`)
      .set(headers)
      .send({ code: branch.code })
      .expect(200);

    expect(taken.body.message).toBe('Ya existe una sucursal con ese código.');
    await request(server)
      .patch('/branches/11111111-2222-4333-8444-555555555555')
      .set(headers)
      .send({ phone: '77610000' })
      .expect(404);
  });

  it('only lets a system admin change branches', async () => {
    const branch = await createTestBranch(prisma);
    const server = app.getHttpServer();
    const branchAdmin = identityHeaders(
      '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      'BRANCH_ADMIN',
      branch.id,
    );

    await request(server)
      .patch(`/branches/${branch.id}`)
      .set(branchAdmin)
      .send({ phone: '77610000' })
      .expect(403);
    await request(server).post(`/branches/${branch.id}/deactivate`).set(branchAdmin).expect(403);
    await request(server).post(`/branches/${branch.id}/reactivate`).set(branchAdmin).expect(403);
  });

  describe('reactivation', () => {
    const NEEDS_ADMIN = 'Para reactivar la sucursal, primero reactiva o invita a su administrador.';

    async function inactiveBranchWithDeactivatedAdmin() {
      const sysAdmin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
      const headers = identityHeaders(sysAdmin.id, 'SYSTEM_ADMIN');
      const branch = await createTestBranch(prisma);
      const only = await activeAccount(app, events, { role: 'BRANCH_ADMIN', branchId: branch.id });
      const server = app.getHttpServer();
      await request(server).post(`/users/${only.id}/deactivate`).set(headers).expect(409);
      await request(server).post(`/branches/${branch.id}/deactivate`).set(headers).expect(204);
      await request(server).post(`/users/${only.id}/deactivate`).set(headers).expect(204);
      return { server, headers, branch, only };
    }

    it('never brings back a branch without a pending or active admin', async () => {
      const { server, headers, branch } = await inactiveBranchWithDeactivatedAdmin();

      const refused = await request(server)
        .post(`/branches/${branch.id}/reactivate`)
        .set(headers)
        .expect(409);

      expect(refused.body.message).toBe(NEEDS_ADMIN);
      expect(await prisma.branch.findUniqueOrThrow({ where: { id: branch.id } })).toMatchObject({
        active: false,
        version: 2,
      });
    });

    it('lets the admin come back while the branch is inactive, and then the branch', async () => {
      const { server, headers, branch, only } = await inactiveBranchWithDeactivatedAdmin();

      await request(server).post(`/users/${only.id}/reactivate`).set(headers).expect(204);
      await request(server).post(`/branches/${branch.id}/reactivate`).set(headers).expect(204);

      const shown = await request(server).get(`/branches/${branch.id}`).set(headers).expect(200);
      expect(shown.body).toMatchObject({
        active: true,
        admins: [{ id: only.id, status: 'ACTIVE' }],
      });
    });

    it('lets a new admin be invited to an inactive branch to get out of the dead end', async () => {
      const { server, headers, branch, only } = await inactiveBranchWithDeactivatedAdmin();

      await request(server)
        .post('/users')
        .set(headers)
        .send({
          fullName: 'Nueva Admin',
          email: testEmail('new-admin'),
          role: 'BRANCH_ADMIN',
          branchId: branch.id,
        })
        .expect(201);
      await request(server).post(`/branches/${branch.id}/reactivate`).set(headers).expect(204);

      expect(
        await prisma.user.count({
          where: { branchId: branch.id, role: 'BRANCH_ADMIN', status: { not: 'INACTIVE' } },
        }),
      ).toBe(1);
      expect(only.id).toBeDefined();
    });

    it('answers 204 for exactly one of reactivating the branch and deactivating its only admin, round after round', async () => {
      const sysAdmin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
      const headers = identityHeaders(sysAdmin.id, 'SYSTEM_ADMIN');
      const branch = await createTestBranch(prisma, { active: false });
      const only = await activeAccount(app, events, { role: 'BRANCH_ADMIN', branchId: branch.id });
      const server = app.getHttpServer();

      for (let round = 0; round < 12; round += 1) {
        await prisma.user.update({ where: { id: only.id }, data: { status: 'ACTIVE' } });
        await prisma.branch.update({ where: { id: branch.id }, data: { active: false } });
        const [reactivation, deactivation] = await Promise.all([
          request(server).post(`/branches/${branch.id}/reactivate`).set(headers),
          request(server).post(`/users/${only.id}/deactivate`).set(headers),
        ]);

        expect([reactivation.status, deactivation.status].sort()).toEqual([204, 409]);
        const [stored, admin] = await Promise.all([
          prisma.branch.findUniqueOrThrow({ where: { id: branch.id } }),
          prisma.user.findUniqueOrThrow({ where: { id: only.id } }),
        ]);
        expect(stored.active && admin.status === 'INACTIVE').toBe(false);
      }
    });
  });
});
