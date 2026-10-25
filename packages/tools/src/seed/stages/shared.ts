import {
  branchWithAdminsPageSchema,
  busPageSchema,
  routePageSchema,
  type Bus,
  type BranchWithAdmins,
  type Route,
} from '@debus/contracts';
import { ADMINISTRACION, FLOTA, PAGE, withQuery } from '../api';
import { ensureSignedIn } from '../accounts';
import { SEED_BRANCHES, adminEmail } from '../catalog';
import type { SeedContext } from '../context';
import type { Session } from '../gateway-client';

// The search matches names and towns too ("gua" finds Antigua Guatemala), so the code decides.
export async function findBranch(
  ctx: SeedContext,
  code: string,
): Promise<BranchWithAdmins | undefined> {
  const found = await ctx.client.request(
    ctx.admin,
    'GET',
    withQuery(`${ADMINISTRACION}/branches`, { ...PAGE, status: 'all', q: code.toLowerCase() }),
    undefined,
    branchWithAdminsPageSchema,
  );
  return found.items.find((branch) => branch.code === code);
}

// A stage may run alone (`--only operations`), so it cannot count on the one before it.
export async function resolveBranchIds(ctx: SeedContext): Promise<Map<string, string>> {
  for (const { code } of SEED_BRANCHES) {
    if (ctx.branchIds.has(code)) continue;
    const branch = await findBranch(ctx, code);
    if (!branch) {
      throw new Error(`The branch ${code} does not exist. Run the structure stage first.`);
    }
    ctx.branchIds.set(code, branch.id);
  }
  return ctx.branchIds;
}

export async function branchAdminSession(ctx: SeedContext, code: string): Promise<Session> {
  const known = ctx.branchAdmins.get(code);
  if (known) return known;
  const session = await ensureSignedIn(
    ctx.client,
    ctx.mailbox,
    adminEmail(ctx.emailBase, code),
    ctx.password,
  );
  ctx.branchAdmins.set(code, session);
  return session;
}

export type FleetBus = Bus & { assignedDriverId: string };

export interface BranchFleet {
  buses: FleetBus[];
  routes: Route[];
}

export async function loadFleet(ctx: SeedContext, session: Session): Promise<BranchFleet> {
  const buses = await ctx.client.request(
    session,
    'GET',
    withQuery(`${FLOTA}/buses`, { ...PAGE, status: 'all' }),
    undefined,
    busPageSchema,
  );
  const routes = await ctx.client.request(
    session,
    'GET',
    withQuery(`${FLOTA}/routes`, { ...PAGE, status: 'active' }),
    undefined,
    routePageSchema,
  );
  return {
    buses: buses.items.flatMap((bus) =>
      bus.active && bus.assignedDriverId
        ? [{ ...bus, assignedDriverId: bus.assignedDriverId }]
        : [],
    ),
    routes: routes.items,
  };
}

// How fast a bus travels on a regular trip, for the estimated arrival of what the seed schedules.
export const CRUISE_KM_PER_HOUR = 55;
