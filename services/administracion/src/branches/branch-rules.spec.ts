import { canLinkToBranch, canViewBranch } from './branch-rules';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const userId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('canViewBranch', () => {
  it('lets system admins and the staff of that branch see it', () => {
    expect(canViewBranch({ userId, role: 'SYSTEM_ADMIN', branchId: null }, branchId)).toBe(true);
    expect(canViewBranch({ userId, role: 'CASHIER', branchId }, branchId)).toBe(true);
  });

  it('hides other branches and clients', () => {
    expect(canViewBranch({ userId, role: 'BRANCH_ADMIN', branchId: userId }, branchId)).toBe(false);
    expect(canViewBranch({ userId, role: 'CLIENT', branchId: null }, branchId)).toBe(false);
  });
});

describe('canLinkToBranch', () => {
  it('lets staff join only branches that exist and are active', () => {
    expect(canLinkToBranch('CASHIER', { active: true })).toBe(true);
    expect(canLinkToBranch('DRIVER', { active: false })).toBe(false);
    expect(canLinkToBranch('CASHIER', null)).toBe(false);
  });

  it('lets a branch admin join an inactive branch, the way to get it an admin again', () => {
    expect(canLinkToBranch('BRANCH_ADMIN', { active: false })).toBe(true);
    expect(canLinkToBranch('BRANCH_ADMIN', null)).toBe(false);
  });
});
