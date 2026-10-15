import { SEED_BRANCHES, adminEmail } from '../catalog';
import { BASE, PASSWORD, setup } from '../testing/setup';
import { branchAdminSession, resolveBranchIds } from './shared';
import { runStructure } from './structure';

describe('resolveBranchIds', () => {
  it('finds the branches the structure stage created, even in a new run', async () => {
    const { gateway, ctx } = setup();
    await runStructure(ctx);
    ctx.branchIds.clear();
    const before = gateway.requests.length;
    const ids = await resolveBranchIds(ctx);
    expect([...ids.keys()]).toEqual(SEED_BRANCHES.map((branch) => branch.code));
    expect(ids.get('GUA')).toBe(gateway.branches.find((branch) => branch.code === 'GUA')?.id);
    expect(gateway.requests.length).toBeGreaterThan(before);
  });

  it('does not ask again once the ids are known', async () => {
    const { gateway, ctx } = setup();
    await runStructure(ctx);
    const before = gateway.requests.length;
    await resolveBranchIds(ctx);
    expect(gateway.requests).toHaveLength(before);
  });

  it('names the stage to run first when a branch is missing', async () => {
    const { ctx } = setup();
    await expect(resolveBranchIds(ctx)).rejects.toThrow('Run the structure stage first');
  });
});

describe('branchAdminSession', () => {
  it('signs the administrator in once and remembers the session', async () => {
    const { gateway, ctx } = setup();
    await runStructure(ctx);
    const first = await branchAdminSession(ctx, 'XEL');
    expect(first.user.email).toBe(adminEmail(BASE, 'XEL'));
    expect(gateway.passwords.get(adminEmail(BASE, 'XEL'))).toBe(PASSWORD);
    const links = gateway.forgot.length;
    await expect(branchAdminSession(ctx, 'XEL')).resolves.toBe(first);
    expect(gateway.forgot).toHaveLength(links);
  });
});
