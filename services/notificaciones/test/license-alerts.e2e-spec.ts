import { randomUUID } from 'node:crypto';
import { testEmail } from '@debus/config/test-data';
import { exampleDriver, todayInGuatemala } from '@debus/contracts';
import { InMemoryEventBus } from '@debus/messaging';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { LicenseAlerts } from '../src/license-alerts/license-alerts.service';
import { addDays } from '../src/license-alerts/license-rules';
import { findMail } from './mailpit';
import { createIsolatedApp } from './support/isolated-app';
import { type IsolatedSchema, isolatedSchema } from './support/isolated-schema';
import { drainQueue } from './support/queue';

// The daily job goes through every driver, so it runs on a schema of its own. The handler uses the
// real day; the job takes it as an argument, always counted from that same day.
let isolated: IsolatedSchema;
let app: INestApplication;
let bus: InMemoryEventBus;
const today = todayInGuatemala();

beforeAll(async () => {
  isolated = await isolatedSchema('license_alerts');
  app = await createIsolatedApp(isolated);
  bus = InMemoryEventBus.attach(app);
});

afterAll(async () => {
  await app?.close();
  await isolated?.drop();
});

function branchWithAdmin() {
  const branchId = randomUUID();
  const admin = {
    userId: randomUUID(),
    email: testEmail('admin-sucursal'),
    fullName: 'Marta Choc',
    role: 'BRANCH_ADMIN',
    branchId,
    profile: null,
  };
  const driver = {
    ...exampleDriver,
    driverId: randomUUID(),
    branchId,
    email: testEmail('chofer'),
    fullName: 'Luis Pérez',
    licenseExpiresOn: addDays(today, 10),
    version: 1,
  };
  return { branchId, admin, driver };
}

const subjects = async (email: string) => (await findMail(email)).map((m) => m.Subject).sort();
const run = (day: string) => app.get(LicenseAlerts).run(day);

describe('licence alerts', () => {
  it('warns the driver and the branch admin once, however many times the driver is published', async () => {
    const { admin, driver } = branchWithAdmin();
    await bus.deliver('UserRegistered', admin);

    await bus.deliver('DriverAdded', driver);
    await bus.deliver('DriverUpdated', { ...driver, version: 2 });
    await run(today);
    await drainQueue(app);

    expect(await subjects(driver.email)).toEqual(['Tu licencia vence en 10 días']);
    expect(await subjects(admin.email)).toEqual(['La licencia de Luis Pérez vence en 10 días']);

    await run(addDays(driver.licenseExpiresOn, -3));
    await drainQueue(app);

    expect(await subjects(driver.email)).toEqual([
      'Tu licencia vence en 10 días',
      'Tu licencia vence en 3 días',
    ]);
    expect(await subjects(admin.email)).toHaveLength(2);
  });

  it('drops a pending alert when the licence is renewed and schedules the new date', async () => {
    const { driver } = branchWithAdmin();
    await bus.deliver('DriverAdded', driver);

    const renewed = { ...driver, licenseExpiresOn: addDays(today, 40), version: 2 };
    await bus.deliver('DriverUpdated', renewed);
    await run(today);
    await drainQueue(app);
    expect(await subjects(driver.email)).toEqual([]);

    await bus.deliver('DriverUpdated', {
      ...renewed,
      licenseExpiresOn: addDays(today, 30),
      version: 3,
    });
    await drainQueue(app);
    expect(await subjects(driver.email)).toEqual(['Tu licencia vence en 30 días']);
  });

  it('follows the admins: one deactivated stops getting alerts, one added later gets the current one', async () => {
    const { branchId, admin, driver } = branchWithAdmin();
    await bus.deliver('UserRegistered', admin);
    await bus.deliver('UserUpdated', {
      userId: admin.userId,
      email: admin.email,
      fullName: admin.fullName,
      role: 'BRANCH_ADMIN',
      branchId,
      active: false,
      version: 2,
    });
    await bus.deliver('DriverAdded', driver);
    await drainQueue(app);
    expect(await subjects(admin.email)).toEqual([]);

    const newcomer = { ...admin, userId: randomUUID(), email: testEmail('admin-nuevo') };
    await bus.deliver('UserRegistered', newcomer);
    await run(today);
    await drainQueue(app);

    expect(await subjects(newcomer.email)).toEqual(['La licencia de Luis Pérez vence en 10 días']);
    expect(await subjects(driver.email)).toHaveLength(1);
  });

  it('warns a branch admin edited while pending once the account is activated', async () => {
    const { branchId, admin, driver } = branchWithAdmin();
    const snapshot = {
      userId: admin.userId,
      email: admin.email,
      fullName: admin.fullName,
      role: 'BRANCH_ADMIN',
      branchId,
    };
    await bus.deliver('UserUpdated', { ...snapshot, active: false, version: 2 });
    // What administracion publishes on activation: UserRegistered and a higher UserUpdated.
    await bus.deliver('UserRegistered', admin);
    await bus.deliver('UserUpdated', { ...snapshot, active: true, version: 3 });

    await bus.deliver('DriverAdded', driver);
    await drainQueue(app);

    expect(await subjects(admin.email)).toEqual(['La licencia de Luis Pérez vence en 10 días']);
  });

  it('warns again a driver deactivated and reactivated before the alert left', async () => {
    const { driver } = branchWithAdmin();
    await bus.deliver('DriverAdded', driver);
    await bus.deliver('DriverUpdated', { ...driver, active: false, version: 2 });
    await bus.deliver('DriverUpdated', { ...driver, active: true, version: 3 });
    await drainQueue(app);

    expect(await subjects(driver.email)).toEqual(['Tu licencia vence en 10 días']);
  });

  it('ignores an older snapshot and never warns about an inactive driver', async () => {
    const { driver } = branchWithAdmin();
    await bus.deliver('DriverAdded', { ...driver, active: false, version: 2 });
    await bus.deliver('DriverUpdated', { ...driver, version: 1 });
    await run(today);
    await drainQueue(app);

    expect(await subjects(driver.email)).toEqual([]);
  });

  it('runs the daily job from its scheduler route', async () => {
    const response = await request(app.getHttpServer())
      .post('/internal/license-alerts/run')
      .expect(200);

    expect(response.body).toEqual({ drivers: expect.any(Number), queued: expect.any(Number) });
    await request(app.getHttpServer()).post('/internal/emails/flush').expect(200);
  });
});
