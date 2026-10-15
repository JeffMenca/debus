import {
  busFieldsSchema,
  busPageSchema,
  busSchema,
  driverPageSchema,
  driverSchema,
  routePageSchema,
  routeSchema,
  type Driver,
  type DriverFields,
} from '@debus/contracts';
import { FLOTA, PAGE, withQuery } from '../api';
import {
  SEED_BRANCHES,
  busesFor,
  driversFor,
  routesFrom,
  type SeedBranch,
  type SeedBus,
} from '../catalog';
import type { SeedContext } from '../context';
import type { Session } from '../gateway-client';
import { Tally, type SeedReport } from '../report';
import { STILL_REGISTERING, pendingCopy, untilRegistered } from '../retry';
import { branchAdminSession, resolveBranchIds } from './shared';

// A route needs the destination branch to have reached the fleet service.
const DESTINATION_PENDING = pendingCopy(
  STILL_REGISTERING,
  'Elige otra sucursal activa como destino.',
);

async function ensureDriver(
  ctx: SeedContext,
  tally: Tally,
  session: Session,
  fields: DriverFields,
): Promise<Driver> {
  const found = await ctx.client.request(
    session,
    'GET',
    withQuery(`${FLOTA}/drivers`, {
      ...PAGE,
      status: 'all',
      q: fields.licenseNumber.toLowerCase(),
    }),
    undefined,
    driverPageSchema,
  );
  const existing = found.items.find((driver) => driver.licenseNumber === fields.licenseNumber);
  ctx.registeredDrivers.add(fields.email);
  if (existing) {
    tally.existing('drivers');
    return existing;
  }
  const created = await ctx.client.request(
    session,
    'POST',
    `${FLOTA}/drivers`,
    fields,
    driverSchema,
  );
  tally.created('drivers');
  ctx.log(`Registered the driver ${fields.fullName}`);
  return created;
}

async function ensureBus(
  ctx: SeedContext,
  tally: Tally,
  session: Session,
  seed: SeedBus,
  driver: Driver,
): Promise<void> {
  const found = await ctx.client.request(
    session,
    'GET',
    withQuery(`${FLOTA}/buses`, { ...PAGE, status: 'all', q: seed.plate.toLowerCase() }),
    undefined,
    busPageSchema,
  );
  if (found.items.some((bus) => bus.plate === seed.plate)) {
    tally.existing('buses');
    return;
  }
  const fields = busFieldsSchema.parse({ ...seed, assignedDriverId: driver.id });
  await ctx.client.request(session, 'POST', `${FLOTA}/buses`, fields, busSchema);
  tally.created('buses');
  ctx.log(`Registered the bus ${seed.plate}`);
}

async function ensureRoutes(
  ctx: SeedContext,
  tally: Tally,
  session: Session,
  branch: SeedBranch,
): Promise<void> {
  const known = await ctx.client.request(
    session,
    'GET',
    withQuery(`${FLOTA}/routes`, { ...PAGE, status: 'all' }),
    undefined,
    routePageSchema,
  );
  for (const route of routesFrom(branch.code)) {
    const destinationBranchId = ctx.branchIds.get(route.to);
    if (!destinationBranchId) throw new Error(`The branch ${route.to} is not known`);
    if (known.items.some((existing) => existing.destinationBranchId === destinationBranchId)) {
      tally.existing('routes');
      continue;
    }
    await untilRegistered(
      () =>
        ctx.client.request(
          session,
          'POST',
          `${FLOTA}/routes`,
          { destinationBranchId, distanceKm: route.distanceKm, ticketPrice: route.ticketPrice },
          routeSchema,
        ),
      { ...ctx.retry, isPending: DESTINATION_PENDING },
    );
    tally.created('routes');
    ctx.log(`Opened the route ${branch.code} to ${route.to}`);
  }
}

// Drivers, buses (each with its regular driver) and the routes that leave every branch, all
// registered by the administrator of the branch.
export async function runFleet(ctx: SeedContext): Promise<SeedReport> {
  const tally = new Tally('fleet');
  await resolveBranchIds(ctx);
  for (const branch of SEED_BRANCHES) {
    const session = await branchAdminSession(ctx, branch.code);
    const drivers: Driver[] = [];
    for (const fields of driversFor(branch.code, ctx.today, ctx.emailBase)) {
      drivers.push(
        await untilRegistered(() => ensureDriver(ctx, tally, session, fields), ctx.retry),
      );
    }
    for (const seed of busesFor(branch.code)) {
      const driver = drivers[seed.driverNumber - 1];
      if (!driver) throw new Error(`The bus ${seed.plate} has no driver ${seed.driverNumber}`);
      await untilRegistered(() => ensureBus(ctx, tally, session, seed, driver), ctx.retry);
    }
    await ensureRoutes(ctx, tally, session, branch);
  }
  return tally.report();
}
