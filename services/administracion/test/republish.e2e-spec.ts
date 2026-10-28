import {
  type BranchChangedPayload,
  type SettingsUpdatedPayload,
  type UserUpdatedPayload,
  userUpdatedPayloadSchema,
  branchChangedPayloadSchema,
  settingsUpdatedPayloadSchema,
  todayInGuatemala,
} from '@debus/contracts';
import { identityHeaders } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { activeAccount } from './support/accounts';
import { createTestApp } from './support/app';
import { createTestBranch } from './support/branches';
import { cleanTestData } from './support/cleanup';
import { type EventCapture, captureEvents } from './support/events';

describe('republishing for the services that keep a copy', () => {
  let app: INestApplication;
  let events: EventCapture;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

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

  it('sends a branch again with a higher version, and touches no other branch', async () => {
    const own = await createTestBranch(prisma);
    const other = await createTestBranch(prisma);

    const response = await http()
      .post('/internal/branches/republish')
      .query({ branchId: own.id })
      .expect(200);

    expect(response.body).toEqual({ republished: 1 });
    const sent = await events.next<BranchChangedPayload>(
      'BranchUpdated',
      (payload) => payload.branchId === own.id,
    );
    expect(branchChangedPayloadSchema.parse(sent)).toMatchObject({
      code: own.code,
      name: own.name,
      active: true,
      version: 2,
    });
    expect((await prisma.branch.findUniqueOrThrow({ where: { id: own.id } })).version).toBe(2);
    expect((await prisma.branch.findUniqueOrThrow({ where: { id: other.id } })).version).toBe(1);
    await events.none<BranchChangedPayload>(
      'BranchUpdated',
      (payload) => payload.branchId === other.id,
    );
  });

  it('sends every settings version again as it is, with its own version id', async () => {
    const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
    const created = await http()
      .post('/settings')
      .set(identityHeaders(admin.id, 'SYSTEM_ADMIN'))
      .send({ depreciationPerKm: 1.35, rentalRatePerKm: 13.5, effectiveFrom: todayInGuatemala() })
      .expect(201);
    const before = await prisma.settingsVersion.findMany({ orderBy: { id: 'asc' } });
    const original = await events.next<SettingsUpdatedPayload>(
      'SettingsUpdated',
      (payload) => payload.versionId === created.body.id,
    );

    const response = await http().post('/internal/settings/republish').expect(200);

    // The suites of this service run one at a time, so nothing else adds versions meanwhile.
    expect(response.body.republished).toBe(before.length);
    const again = (id: string) => (payload: SettingsUpdatedPayload) => payload.versionId === id;
    expect(await events.count('SettingsUpdated', again(created.body.id))).toBe(2);
    expect(settingsUpdatedPayloadSchema.parse(original)).toMatchObject({
      depreciationPerKm: 1.35,
      rentalRatePerKm: 13.5,
    });
    // The immutability trigger already refuses any change to a row (the call above would be a 500),
    // so what is left to prove is that republishing adds no version of its own.
    const after = await prisma.settingsVersion.findMany({ orderBy: { id: 'asc' } });
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
  });

  it('sends every account of a branch again with a higher version, and no other branch', async () => {
    const branch = await createTestBranch(prisma);
    const otherBranch = await createTestBranch(prisma);
    const admin = await activeAccount(app, events, { role: 'BRANCH_ADMIN', branchId: branch.id });
    const cashier = await activeAccount(app, events, { role: 'CASHIER', branchId: branch.id });
    const stranger = await activeAccount(app, events, {
      role: 'CASHIER',
      branchId: otherBranch.id,
    });

    // Limited to the test branch, so no real account changes its version.
    const response = await http()
      .post('/internal/users/republish')
      .query({ branchId: branch.id })
      .expect(200);

    expect(response.body).toEqual({ republished: 2 });
    // Activation announced version 2; the republish sends it again one higher.
    for (const [account, role] of [
      [admin, 'BRANCH_ADMIN'],
      [cashier, 'CASHIER'],
    ] as const) {
      const sent = await events.next<UserUpdatedPayload>(
        'UserUpdated',
        (payload) => payload.userId === account.id && payload.version === 3,
      );
      expect(userUpdatedPayloadSchema.parse(sent)).toMatchObject({
        role,
        branchId: branch.id,
        active: true,
      });
    }
    await events.none<UserUpdatedPayload>(
      'UserUpdated',
      (payload) => payload.userId === stranger.id && payload.version === 3,
    );
  });

  it('answers 400 for a branch that is not an id', async () => {
    await http().post('/internal/branches/republish').query({ branchId: 'x' }).expect(400);
  });

  it('answers 0 for a branch that does not exist', async () => {
    const response = await http()
      .post('/internal/branches/republish')
      .query({ branchId: '00000000-0000-4000-8000-000000000000' })
      .expect(200);
    expect(response.body).toEqual({ republished: 0 });
  });
});
