import type { UserRole } from '@debus/contracts';

export const ROLE_LABELS: Record<UserRole, string> = {
  SYSTEM_ADMIN: 'Admin. del sistema',
  BRANCH_ADMIN: 'Admin. de sucursal',
  CASHIER: 'Cajero',
  DRIVER: 'Chofer',
  CLIENT: 'Cliente',
};

export const STAFF_ROLES = ['SYSTEM_ADMIN', 'BRANCH_ADMIN', 'CASHIER', 'DRIVER'] as const;
