import type { Identity } from '@debus/server';
import type { BranchListQuery } from '@debus/contracts';
import { branchCountWhere, branchListWhere, toBranchStatusCounts } from './branch-scope';

const system = { userId: 'u', role: 'SYSTEM_ADMIN', branchId: null } as Identity;
const cashier = { userId: 'c', role: 'CASHIER', branchId: 'b' } as Identity;
const query = (extra: Partial<BranchListQuery>): BranchListQuery => ({
  status: 'active',
  page: 1,
  pageSize: 20,
  ...extra,
});

describe('branchListWhere', () => {
  it('lets only a system admin see inactive branches', () => {
    expect(branchListWhere(system, query({ status: 'active' }))).toEqual({ active: true });
    expect(branchListWhere(system, query({ status: 'inactive' }))).toEqual({ active: false });
    expect(branchListWhere(system, query({ status: 'all' }))).toEqual({});
    expect(branchListWhere(cashier, query({ status: 'all' }))).toEqual({ active: true });
    expect(branchListWhere(cashier, query({ status: 'inactive' }))).toEqual({ active: true });
  });

  it('searches the folded text and counts without the status', () => {
    expect(branchListWhere(system, query({ q: 'peten' }))).toEqual({
      active: true,
      searchText: { contains: 'peten' },
    });
    expect(branchCountWhere(system, query({ status: 'inactive', q: 'peten' }))).toEqual({
      searchText: { contains: 'peten' },
    });
    expect(branchCountWhere(cashier, query({}))).toEqual({ active: true });
  });

  it('searches % and _ as the characters they are', () => {
    expect(branchListWhere(system, query({ status: 'all', q: '50%_x' }))).toEqual({
      searchText: { contains: '50\\%\\_x' },
    });
  });
});

describe('toBranchStatusCounts', () => {
  it('counts active and inactive branches', () => {
    expect(toBranchStatusCounts([{ active: false, _count: { _all: 2 } }])).toEqual({
      active: 0,
      inactive: 2,
    });
  });

  it('ignores rows that carry no count', () => {
    expect(toBranchStatusCounts([{ active: true }, { active: false, _count: true }])).toEqual({
      active: 0,
      inactive: 0,
    });
  });
});
