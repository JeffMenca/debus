import { SEED_BRANCHES, adminEmail, cashierEmail, driverEmail } from '../catalog';
import { BASE, PASSWORD, setup } from '../testing/setup';
import { runAccounts } from './accounts';
import { runStructure } from './structure';

async function afterStructure() {
  const world = setup();
  await runStructure(world.ctx);
  return world;
}

describe('runAccounts', () => {
  it('activates every administrator and cashier with the seed password', async () => {
    const { gateway, ctx } = await afterStructure();
    const report = await runAccounts(ctx);
    for (const { code } of SEED_BRANCHES) {
      expect(gateway.passwords.get(adminEmail(BASE, code))).toBe(PASSWORD);
      expect(gateway.passwords.get(cashierEmail(BASE, code))).toBe(PASSWORD);
    }
    expect(report.counts.admins).toEqual({ created: 6, existing: 0 });
    expect(report.counts.cashiers).toEqual({ created: 6, existing: 0 });
  });

  it('keeps the session of each branch administrator by branch code', async () => {
    const { ctx } = await afterStructure();
    await runAccounts(ctx);
    expect([...ctx.branchAdmins.keys()]).toEqual(SEED_BRANCHES.map((branch) => branch.code));
    const xel = ctx.branchAdmins.get('XEL');
    expect(xel?.user).toMatchObject({ role: 'BRANCH_ADMIN', email: adminEmail(BASE, 'XEL') });
    expect(xel?.user.branchId).toBe(ctx.branchIds.get('XEL'));
  });

  it('does not ask for a single link the second time', async () => {
    const { gateway, ctx } = await afterStructure();
    await runAccounts(ctx);
    const links = gateway.forgot.length;
    const second = await runAccounts(ctx);
    expect(gateway.forgot).toHaveLength(links);
    expect(second.counts.admins).toEqual({ created: 0, existing: 6 });
    expect(ctx.branchAdmins.size).toBe(6);
  });

  it('leaves the drivers for later while their accounts do not exist yet', async () => {
    const { gateway, ctx } = await afterStructure();
    const report = await runAccounts(ctx);
    expect(gateway.forgot.some((email) => email.includes('chofer'))).toBe(false);
    expect(report.counts.drivers).toEqual({ created: 0, existing: 0, skipped: 18 });
  });

  it('activates the drivers the fleet stage registered', async () => {
    const { gateway, ctx } = await afterStructure();
    const email = driverEmail(BASE, 'XEL', 1);
    gateway.users.push({
      id: '00000000-0000-4000-8000-000000000999',
      fullName: 'Carlos',
      email,
      role: 'DRIVER',
      branchId: ctx.branchIds.get('XEL') ?? null,
      status: 'PENDING',
    });
    ctx.registeredDrivers.add(email);
    const report = await runAccounts(ctx);
    expect(gateway.passwords.get(email)).toBe(PASSWORD);
    expect(report.counts.drivers).toEqual({ created: 1, existing: 0, skipped: 17 });
  });

  it('counts a driver who can already sign in even when the fleet stage did not run', async () => {
    const { gateway, ctx } = await afterStructure();
    const email = driverEmail(BASE, 'GUA', 1);
    gateway.users.push({
      id: '00000000-0000-4000-8000-000000000998',
      fullName: 'Mynor',
      email,
      role: 'DRIVER',
      branchId: ctx.branchIds.get('GUA') ?? null,
      status: 'ACTIVE',
    });
    gateway.passwords.set(email, PASSWORD);
    const report = await runAccounts(ctx);
    expect(report.counts.drivers).toEqual({ created: 0, existing: 1, skipped: 17 });
  });

  it('asks for the structure stage when a branch does not exist', async () => {
    const { ctx } = setup();
    await expect(runAccounts(ctx)).rejects.toThrow('structure');
  });
});
