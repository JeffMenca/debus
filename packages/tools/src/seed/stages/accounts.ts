import { ensureSignedIn } from '../accounts';
import { SEED_BRANCHES, adminEmail, busesFor, cashierEmail, driverEmail } from '../catalog';
import type { SeedContext } from '../context';
import { isUnauthorized, type Session } from '../gateway-client';
import { Tally, type SeedReport } from '../report';
import { resolveBranchIds } from './shared';

async function activate(
  ctx: SeedContext,
  tally: Tally,
  kind: string,
  email: string,
): Promise<Session> {
  let activated = false;
  const session = await ensureSignedIn(ctx.client, ctx.mailbox, email, ctx.password, () => {
    activated = true;
  });
  if (activated) {
    tally.created(kind);
    ctx.log(`Activated ${email}`);
  } else {
    tally.existing(kind);
  }
  return session;
}

// A driver's account follows the driver, so it exists only once the fleet stage registered them.
async function activateDriver(ctx: SeedContext, tally: Tally, email: string): Promise<void> {
  if (ctx.registeredDrivers.has(email)) {
    await activate(ctx, tally, 'drivers', email);
    return;
  }
  try {
    await ctx.client.login(email, ctx.password);
    tally.existing('drivers');
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
    tally.skipped('drivers');
  }
}

// Gives every account the seed password through the link the person would receive. Runs twice in a
// full seed: the first time for the staff, the second for the drivers the fleet stage registered.
export async function runAccounts(ctx: SeedContext): Promise<SeedReport> {
  const tally = new Tally('accounts');
  await resolveBranchIds(ctx);
  for (const { code } of SEED_BRANCHES) {
    const admin = adminEmail(ctx.emailBase, code);
    const session = await activate(ctx, tally, 'admins', admin);
    ctx.branchAdmins.set(code, session);
    await activate(ctx, tally, 'cashiers', cashierEmail(ctx.emailBase, code));
    for (let number = 1; number <= busesFor(code).length; number++) {
      await activateDriver(ctx, tally, driverEmail(ctx.emailBase, code, number));
    }
  }
  return tally.report();
}
