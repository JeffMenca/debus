import {
  type AccountLinkSentPayload,
  type BranchChangedPayload,
  branchChangedPayloadSchema,
  branchSchema,
} from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { activeAccount } from './support/accounts';
import { createTestApp, tokenOf, uniqueEmail } from './support/app';
import { branchFields, createTestBranch } from './support/branches';
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
    const email = uniqueEmail('first-admin');
    const body = { ...branchFields(), admin: { fullName: 'Luis Ramírez', email } };

    const created = await request(app.getHttpServer())
      .post('/branches')
      .set(identityHeaders(admin.id, 'SYSTEM_ADMIN'))
      .send(body)
      .expect(201);

    expect(branchSchema.parse(created.body)).toMatchObject({
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

  it('refuses a repeated code, a repeated name and invalid bodies', async () => {
    const server = app.getHttpServer();
    const actor = identityHeaders(
      (await activeAccount(app, events, { role: 'SYSTEM_ADMIN' })).id,
      'SYSTEM_ADMIN',
    );
    const existing = await createTestBranch(prisma);
    const newAdmin = () => ({ fullName: 'Ana Sic', email: uniqueEmail('admin') });

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
    const body = { ...branchFields(), admin: { fullName: 'Ana Sic', email: uniqueEmail('admin') } };

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
    const idsOf = (response: request.Response) => response.body.map((b: { id: string }) => b.id);

    const plain = await request(server)
      .get('/branches')
      .set(identityHeaders(userId, 'SYSTEM_ADMIN'))
      .expect(200);
    const all = await request(server)
      .get('/branches?includeInactive=true')
      .set(identityHeaders(userId, 'SYSTEM_ADMIN'))
      .expect(200);
    const asCashier = await request(server)
      .get('/branches?includeInactive=true')
      .set(identityHeaders(userId, 'CASHIER', active.id))
      .expect(200);

    expect(idsOf(plain)).toContain(active.id);
    expect(idsOf(plain)).not.toContain(inactive.id);
    expect(idsOf(all)).toEqual(expect.arrayContaining([active.id, inactive.id]));
    expect(idsOf(asCashier)).not.toContain(inactive.id);
    await request(server).get('/branches').expect(401);
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
});
