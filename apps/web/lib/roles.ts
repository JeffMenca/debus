import { INVITABLE_ROLES, type UserRole } from '@debus/contracts';

export const ROLE_LABELS: Record<UserRole, string> = {
  SYSTEM_ADMIN: 'Admin. del sistema',
  BRANCH_ADMIN: 'Admin. de sucursal',
  CASHIER: 'Cajero',
  DRIVER: 'Chofer',
  CLIENT: 'Cliente',
};

export const STAFF_ROLES = ['SYSTEM_ADMIN', 'BRANCH_ADMIN', 'CASHIER', 'DRIVER'] as const;

// Clients register on their own and drivers are registered from the fleet screens.
export type InvitableStaffRole = Exclude<(typeof INVITABLE_ROLES)[number], 'CLIENT'>;
export const INVITABLE_STAFF_ROLES = INVITABLE_ROLES.filter(
  (role): role is InvitableStaffRole => role !== 'CLIENT',
);
