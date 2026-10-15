import { branchWithAdminsPageSchema, type BranchWithAdmins } from '@debus/contracts';
import { ADMINISTRACION, PAGE, withQuery } from '../api';
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
