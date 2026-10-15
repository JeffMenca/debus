import {
  branchSchema,
  createBranchRequestSchema,
  createSettingsRequestSchema,
  createUserRequestSchema,
  managedUserSchema,
  settingsPageSchema,
  userPageSchema,
} from '@debus/contracts';
import { ADMINISTRACION, PAGE, withQuery } from '../api';
import { SEED_BRANCHES, adminEmail, branchFields, cashierEmail, type SeedBranch } from '../catalog';
import type { SeedContext } from '../context';
import { Tally, type SeedReport } from '../report';
import { findBranch } from './shared';

const DEPRECIATION_PER_KM = 1.25;
const RENTAL_RATE_PER_KM = 12;

async function ensureSettings(ctx: SeedContext, tally: Tally): Promise<void> {
  const page = await ctx.client.request(
    ctx.admin,
    'GET',
    withQuery(`${ADMINISTRACION}/settings`, { page: 1, pageSize: 1 }),
    undefined,
    settingsPageSchema,
  );
  if (page.summary.current) {
    tally.existing('settings');
    return;
  }
  const request = createSettingsRequestSchema.parse({
    depreciationPerKm: DEPRECIATION_PER_KM,
    rentalRatePerKm: RENTAL_RATE_PER_KM,
    effectiveFrom: ctx.today,
  });
  await ctx.client.request(ctx.admin, 'POST', `${ADMINISTRACION}/settings`, request);
  tally.created('settings');
  ctx.log('Created the configuration in force');
}

async function ensureBranch(ctx: SeedContext, tally: Tally, seed: SeedBranch): Promise<string> {
  const existing = await findBranch(ctx, seed.code);
  if (existing) {
    tally.existing('branches');
    return existing.id;
  }
  const request = createBranchRequestSchema.parse({
    ...branchFields(seed),
    admin: { fullName: seed.adminName, email: adminEmail(ctx.emailBase, seed.code) },
  });
  const created = await ctx.client.request(
    ctx.admin,
    'POST',
    `${ADMINISTRACION}/branches`,
    request,
    branchSchema,
  );
  tally.created('branches');
  ctx.log(`Created the branch ${seed.name}`);
  return created.id;
}

async function ensureCashier(
  ctx: SeedContext,
  tally: Tally,
  seed: SeedBranch,
  branchId: string,
): Promise<void> {
  const email = cashierEmail(ctx.emailBase, seed.code);
  const found = await ctx.client.request(
    ctx.admin,
    'GET',
    withQuery(`${ADMINISTRACION}/users`, { ...PAGE, q: email }),
    undefined,
    userPageSchema,
  );
  if (found.items.some((user) => user.email === email)) {
    tally.existing('cashiers');
    return;
  }
  const request = createUserRequestSchema.parse({
    fullName: seed.cashierName,
    email,
    role: 'CASHIER',
    branchId,
  });
  await ctx.client.request(
    ctx.admin,
    'POST',
    `${ADMINISTRACION}/users`,
    request,
    managedUserSchema,
  );
  tally.created('cashiers');
}

// The company configuration, the branches and the people who run them.
export async function runStructure(ctx: SeedContext): Promise<SeedReport> {
  const tally = new Tally('structure');
  await ensureSettings(ctx, tally);
  for (const seed of SEED_BRANCHES) {
    const branchId = await ensureBranch(ctx, tally, seed);
    ctx.branchIds.set(seed.code, branchId);
    await ensureCashier(ctx, tally, seed, branchId);
  }
  return tally.report();
}
