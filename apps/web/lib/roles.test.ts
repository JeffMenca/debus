import { USER_ROLES } from '@debus/contracts';
import { ROLE_LABELS, STAFF_ROLES } from './roles';

describe('roles', () => {
  it('has a friendly label for every role', () => {
    for (const role of USER_ROLES) expect(ROLE_LABELS[role]).toBeTruthy();
    expect(ROLE_LABELS.SYSTEM_ADMIN).toBe('Admin. del sistema');
  });

  it('lists the staff roles without clients', () => {
    expect(STAFF_ROLES).toEqual(['SYSTEM_ADMIN', 'BRANCH_ADMIN', 'CASHIER', 'DRIVER']);
  });
});
