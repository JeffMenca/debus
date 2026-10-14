import { testSchema } from '@debus/config/test-data';
import { identityHeaders as as } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { activeAccount } from './support/accounts';
import { type EventCapture, captureEvents } from './support/events';
import { type IsolatedApp, createIsolatedApp } from './support/isolated-app';

// No account behind it: the service trusts the identity headers the gateway sets.
const callerId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const LAST_ADMIN = 'Debe quedar al menos un administrador del sistema activo.';
const SCHEMA_LABEL = 'admins';

// The rule "one system admin always stays active" is global to the database. These tests need to
// know exactly who is active, so they run on a schema of their own where only the admins they
// create are active, and never switch off the real ones.
describe('system admins that deactivate at the same time', () => {
  let isolated: IsolatedApp;
  let app: INestApplication;
  let prisma: PrismaService;
  let events: EventCapture;

  beforeAll(async () => {
    events = await captureEvents();
    isolated = await createIsolatedApp(SCHEMA_LABEL);
    app = isolated.app;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      await isolated?.dispose();
    } finally {
      await events?.close();
    }
  });

  // Each test starts with no active system admin, so it knows exactly who counts.
  beforeEach(async () => {
    await prisma.user.updateMany({
      where: { role: 'SYSTEM_ADMIN', status: 'ACTIVE' },
      data: { status: 'INACTIVE' },
    });
  });

  const newAdmins = async (count: number) =>
    (
      await Promise.all(
        Array.from({ length: count }, () => activeAccount(app, events, { role: 'SYSTEM_ADMIN' })),
      )
    ).map((account) => account.id);
  const deactivate = (id: string) =>
    request(app.getHttpServer()).post(`/users/${id}/deactivate`).set(as(callerId, 'SYSTEM_ADMIN'));
  const activeAmong = (ids: string[]) =>
    prisma.user.count({ where: { id: { in: ids }, status: 'ACTIVE' } });
  const activateAll = (ids: string[]) =>
    prisma.user.updateMany({ where: { id: { in: ids } }, data: { status: 'ACTIVE' } });

  it('works on a schema of its own, not on the one the real accounts live in', async () => {
    const rows = await prisma.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;

    expect(rows.map((row) => row.schema)).toEqual([testSchema(SCHEMA_LABEL)]);
  });

  it('refuses to deactivate the only active system admin', async () => {
    const [id] = (await newAdmins(1)) as [string];

    const response = await deactivate(id).expect(409);

    expect(response.body.message).toBe(LAST_ADMIN);
    expect(await activeAmong([id])).toBe(1);
  });

  it('answers 409, never 500, to the loser of two simultaneous deactivations, round after round', async () => {
    const ids = await newAdmins(2);
    // Races only show up some of the time: repeat them.
    for (let round = 0; round < 12; round += 1) {
      await activateAll(ids);
      const responses = await Promise.all(ids.map(deactivate));

      expect(responses.map((response) => response.status).sort()).toEqual([204, 409]);
      const loser = responses.find((response) => response.status === 409);
      expect(loser?.body.message).toBe(LAST_ADMIN);
      expect(await activeAmong(ids)).toBe(1);
    }
  });

  it('lets exactly one system admin survive when several are deactivated at once, round after round', async () => {
    const ids = await newAdmins(4);
    for (let round = 0; round < 30; round += 1) {
      await activateAll(ids);
      const responses = await Promise.all(ids.map(deactivate));

      const losers = responses.filter((response) => response.status !== 204);
      expect(losers.map((loser) => [loser.status, loser.body.message])).toEqual([
        [409, LAST_ADMIN],
      ]);
      expect(await activeAmong(ids)).toBe(1);
    }
  });

  it('answers 204 to every one of several simultaneous deactivations of the same admin', async () => {
    const [target, other] = (await newAdmins(2)) as [string, string];
    for (let round = 0; round < 15; round += 1) {
      await activateAll([target, other]);
      const responses = await Promise.all(Array.from({ length: 4 }, () => deactivate(target)));

      expect(responses.map((response) => [response.status, response.body.message])).toEqual(
        Array.from({ length: 4 }, () => [204, undefined]),
      );
      expect(await prisma.user.findUnique({ where: { id: target } })).toMatchObject({
        status: 'INACTIVE',
      });
      expect(await prisma.user.findUnique({ where: { id: other } })).toMatchObject({
        status: 'ACTIVE',
      });
    }
  });
});
