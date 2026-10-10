import {
  activationReason,
  canCreateRole,
  canDeactivate,
  canSendNotice,
  linkState,
  lockExpiry,
} from './account-rules';

const now = new Date('2026-10-09T12:00:00.000Z');
const branch = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const other = '9b2c7a10-1111-4c4c-8888-123456789abc';

describe('canCreateRole', () => {
  it('lets a system admin create any role', () => {
    const actor = { role: 'SYSTEM_ADMIN' as const, branchId: null };
    for (const role of ['SYSTEM_ADMIN', 'BRANCH_ADMIN', 'CASHIER', 'DRIVER', 'CLIENT'] as const) {
      expect(canCreateRole(actor, { role, branchId: branch })).toBe(true);
    }
  });

  it('lets a branch admin create cashiers and drivers only in their branch', () => {
    const actor = { role: 'BRANCH_ADMIN' as const, branchId: branch };

    expect(canCreateRole(actor, { role: 'CASHIER', branchId: branch })).toBe(true);
    expect(canCreateRole(actor, { role: 'DRIVER', branchId: branch })).toBe(true);
    expect(canCreateRole(actor, { role: 'DRIVER', branchId: other })).toBe(false);
    expect(canCreateRole(actor, { role: 'BRANCH_ADMIN', branchId: branch })).toBe(false);
    expect(canCreateRole(actor, { role: 'CLIENT' })).toBe(false);
  });

  it('denies everyone else', () => {
    for (const role of ['CASHIER', 'DRIVER', 'CLIENT'] as const) {
      expect(canCreateRole({ role, branchId: branch }, { role: 'CLIENT' })).toBe(false);
    }
  });
});

describe('canDeactivate', () => {
  it('keeps the last active system admin', () => {
    expect(canDeactivate({ role: 'SYSTEM_ADMIN', status: 'ACTIVE' }, 1)).toBe(false);
    expect(canDeactivate({ role: 'SYSTEM_ADMIN', status: 'ACTIVE' }, 2)).toBe(true);
    expect(canDeactivate({ role: 'SYSTEM_ADMIN', status: 'PENDING' }, 1)).toBe(true);
    expect(canDeactivate({ role: 'CASHIER', status: 'ACTIVE' }, 1)).toBe(true);
  });
});

describe('linkState', () => {
  it('classifies links', () => {
    expect(linkState(null, now)).toBe('invalid');
    expect(linkState({ expiresAt: new Date(now.getTime() + 1), usedAt: null }, now)).toBe('valid');
    expect(linkState({ expiresAt: now, usedAt: null }, now)).toBe('expired');
    expect(linkState({ expiresAt: new Date(now.getTime() - 1), usedAt: now }, now)).toBe('used');
  });
});

describe('login lock', () => {
  it('locks for 15 minutes', () => {
    expect(lockExpiry(now)).toEqual(new Date('2026-10-09T12:15:00.000Z'));
  });
});

describe('notices', () => {
  it('names the activation email after who created the account', () => {
    expect(activationReason({ createdById: null, role: 'CLIENT' })).toBe('SIGNUP');
    expect(activationReason({ createdById: branch, role: 'CLIENT' })).toBe('INVITATION');
    expect(activationReason({ createdById: null, role: 'SYSTEM_ADMIN' })).toBe('INVITATION');
  });

  it('sends the already registered notice at most once per hour', () => {
    expect(canSendNotice(null, now)).toBe(true);
    expect(canSendNotice(new Date(now.getTime() - 59 * 60_000), now)).toBe(false);
    expect(canSendNotice(new Date(now.getTime() - 60 * 60_000), now)).toBe(true);
  });
});
