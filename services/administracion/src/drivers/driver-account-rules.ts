import type { DriverChangedPayload, UserRole } from '@debus/contracts';

export type DriverAccountChange = 'create' | 'update' | 'ignore';

// flota owns drivers; the account follows the newest snapshot and never takes over another account.
export function driverAccountChange(
  user: { role: UserRole; driverVersion: number | null } | null,
  payload: DriverChangedPayload,
): DriverAccountChange {
  if (!user) return 'create';
  if (user.role !== 'DRIVER') return 'ignore';
  return payload.version > (user.driverVersion ?? 0) ? 'update' : 'ignore';
}
