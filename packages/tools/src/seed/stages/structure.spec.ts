import { SEED_BRANCHES, adminEmail, branchFields, cashierEmail } from '../catalog';
import type { FakeGateway } from '../testing/fake-gateway';
import { BASE, setup } from '../testing/setup';
import { runStructure } from './structure';

const posts = (gateway: FakeGateway) =>
  gateway.requests.filter((request) => request.method === 'POST');

describe('runStructure', () => {
  it('creates the configuration when none is in force', async () => {
    const { gateway, ctx } = setup();
    await runStructure(ctx);
    expect(gateway.settings).toHaveLength(1);
    expect(gateway.settings[0]).toMatchObject({
      depreciationPerKm: 1.25,
      rentalRatePerKm: 12,
      effectiveFrom: '2026-10-19',
    });
  });

  it('keeps the configuration that is already in force', async () => {
    const { gateway, ctx } = setup();
    gateway.settings.push({
      id: '00000000-0000-4000-8000-000000000777',
      depreciationPerKm: 2,
      rentalRatePerKm: 15,
      effectiveFrom: '2026-01-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdByName: null,
    });
    await runStructure(ctx);
    expect(gateway.settings).toHaveLength(1);
  });

  it('creates the six branches, each with its administrator', async () => {
    const { gateway, ctx } = setup();
    await runStructure(ctx);
    expect(gateway.branches.map((branch) => branch.code)).toEqual(
      SEED_BRANCHES.map((branch) => branch.code),
    );
    const xel = gateway.branches.find((branch) => branch.code === 'XEL');
    expect(xel).toMatchObject({ name: 'Quetzaltenango', department: 'Quetzaltenango' });
    const admin = gateway.users.find((user) => user.email === adminEmail(BASE, 'XEL'));
    expect(admin).toMatchObject({ role: 'BRANCH_ADMIN', branchId: xel?.id });
    expect(ctx.branchIds.get('XEL')).toBe(xel?.id);
  });

  it('invites one cashier per branch', async () => {
    const { gateway, ctx } = setup();
    await runStructure(ctx);
    for (const branch of gateway.branches) {
      const cashier = gateway.users.find(
        (user) => user.email === cashierEmail(BASE, String(branch.code)),
      );
      expect(cashier).toMatchObject({ role: 'CASHIER', branchId: branch.id });
    }
  });

  it('does not take another branch for one just because the search finds it', async () => {
    const { gateway, ctx } = setup();
    // The search for "gua" finds Antigua Guatemala, but that is not GUA.
    const antigua = SEED_BRANCHES.find((branch) => branch.code === 'ANT');
    if (!antigua) throw new Error('catalog without ANT');
    gateway.branches.push({
      ...branchFields(antigua),
      id: '00000000-0000-4000-8000-000000000555',
      active: true,
      version: 1,
    });
    await runStructure(ctx);
    expect(gateway.branches.map((branch) => branch.code).sort()).toEqual(
      SEED_BRANCHES.map((branch) => branch.code).sort(),
    );
  });

  it('creates nothing the second time', async () => {
    const { gateway, ctx } = setup();
    const first = await runStructure(ctx);
    const afterFirst = posts(gateway).length;
    const second = await runStructure(ctx);
    expect(posts(gateway)).toHaveLength(afterFirst);
    expect(first.area).toBe('structure');
    expect(first.counts.branches).toEqual({ created: 6, existing: 0 });
    expect(first.counts.cashiers).toEqual({ created: 6, existing: 0 });
    expect(first.counts.settings).toEqual({ created: 1, existing: 0 });
    expect(second.counts.branches).toEqual({ created: 0, existing: 6 });
    expect(second.counts.cashiers).toEqual({ created: 0, existing: 6 });
    expect(second.counts.settings).toEqual({ created: 0, existing: 1 });
    expect(ctx.branchIds.size).toBe(6);
  });

  it('does the work as the system admin', async () => {
    const { gateway, ctx } = setup();
    await runStructure(ctx);
    expect(new Set(gateway.requests.map((request) => request.email))).toEqual(
      new Set(['admin@debus.local']),
    );
  });
});
