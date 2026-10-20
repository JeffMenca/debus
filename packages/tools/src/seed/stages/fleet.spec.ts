import { GatewayError } from '../gateway-client';
import { SEED_BRANCHES, SEED_ROUTES, busesFor, driverEmail, driversFor } from '../catalog';
import { BASE, TODAY, setup } from '../testing/setup';
import { runAccounts } from './accounts';
import { runFleet } from './fleet';
import { runStructure } from './structure';

async function ready() {
  const world = setup();
  await runStructure(world.ctx);
  await runAccounts(world.ctx);
  return world;
}
const posts = (requests: { method: string }[]) =>
  requests.filter((request) => request.method === 'POST').length;

describe('runFleet', () => {
  it('registers the drivers, buses and routes of every branch', async () => {
    const { gateway, ctx } = await ready();
    const report = await runFleet(ctx);
    const expectedBuses = SEED_BRANCHES.flatMap((branch) => busesFor(branch.code));
    expect(gateway.drivers).toHaveLength(expectedBuses.length);
    expect(gateway.buses).toHaveLength(expectedBuses.length);
    expect(gateway.routes).toHaveLength(SEED_ROUTES.length);
    expect(report.counts.drivers).toEqual({ created: expectedBuses.length, existing: 0 });
    expect(report.counts.buses).toEqual({ created: expectedBuses.length, existing: 0 });
    expect(report.counts.routes).toEqual({ created: SEED_ROUTES.length, existing: 0 });
  });

  it('gives each bus its regular driver', async () => {
    const { gateway, ctx } = await ready();
    await runFleet(ctx);
    const [bus] = busesFor('XEL');
    const driver = gateway.drivers.find(
      (candidate) => candidate.email === driverEmail(BASE, 'XEL', 1),
    );
    const created = gateway.buses.find((candidate) => candidate.plate === bus?.plate);
    expect(created?.assignedDriverId).toBe(driver?.id);
  });

  it('creates each record as the administrator of its branch', async () => {
    const { gateway, ctx } = await ready();
    const before = gateway.requests.length;
    await runFleet(ctx);
    const fleetPosts = gateway.requests
      .slice(before)
      .filter((request) => request.method === 'POST' && request.path.startsWith('/api/flota'));
    expect(fleetPosts.length).toBeGreaterThan(0);
    expect(fleetPosts.every((request) => request.email?.startsWith('seed+admin-'))).toBe(true);
    const route = gateway.routes.find((candidate) => candidate.originName === 'Quetzaltenango');
    expect(route?.originBranchId).toBe(ctx.branchIds.get('XEL'));
  });

  it('uses the licences the catalog defines', async () => {
    const { gateway, ctx } = await ready();
    await runFleet(ctx);
    const [first] = driversFor('GUA', TODAY, BASE);
    expect(gateway.drivers.find((driver) => driver.email === first?.email)).toMatchObject({
      licenseNumber: first?.licenseNumber,
      licenseExpiresOn: first?.licenseExpiresOn,
    });
  });

  it('remembers the drivers it registered so their accounts can be activated', async () => {
    const { ctx } = await ready();
    await runFleet(ctx);
    expect(ctx.registeredDrivers.has(driverEmail(BASE, 'FLO', 1))).toBe(true);
    expect(ctx.registeredDrivers.size).toBe(
      SEED_BRANCHES.flatMap((branch) => busesFor(branch.code)).length,
    );
  });

  it('creates nothing the second time', async () => {
    const { gateway, ctx } = await ready();
    await runFleet(ctx);
    const before = posts(gateway.requests);
    const second = await runFleet(ctx);
    expect(posts(gateway.requests)).toBe(before);
    expect(second.counts.buses?.created).toBe(0);
    expect(second.counts.buses?.existing).toBe(18);
    expect(second.counts.routes?.existing).toBe(SEED_ROUTES.length);
  });

  it('waits while the destination branch has not reached the fleet service', async () => {
    const { gateway, ctx } = await ready();
    gateway.failNext(
      /POST \/api\/flota\/routes/,
      new GatewayError(409, 'Elige otra sucursal activa como destino.'),
      3,
    );
    await runFleet(ctx);
    expect(gateway.routes).toHaveLength(SEED_ROUTES.length);
  });

  it('fails with the message of any other conflict', async () => {
    const { gateway, ctx } = await ready();
    gateway.failNext(
      /POST \/api\/flota\/buses/,
      new GatewayError(409, 'Ese chofer ya está asignado a otro bus.'),
    );
    await expect(runFleet(ctx)).rejects.toThrow('Ese chofer ya está asignado a otro bus.');
  });

  it('signs in the administrators itself when only this stage runs', async () => {
    const { gateway, ctx } = setup();
    await runStructure(ctx);
    await runFleet(ctx);
    expect(gateway.buses).toHaveLength(18);
    expect(ctx.branchAdmins.size).toBe(6);
  });

  it('asks for the structure stage when a branch does not exist', async () => {
    const { ctx } = setup();
    await expect(runFleet(ctx)).rejects.toThrow('structure');
  });
});
