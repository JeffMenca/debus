import type { Driver, DriverChangedPayload } from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';

export const DRIVER_INCLUDE = { assignedBus: { select: { plate: true } } } as const;
type DriverRow = Prisma.DriverGetPayload<{ include: typeof DRIVER_INCLUDE }>;

// @db.Date comes back as midnight UTC; the ISO day is its first ten characters.
export const toIsoDay = (value: Date): string => value.toISOString().slice(0, 10);
export const fromIsoDay = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const fields = (row: Prisma.DriverGetPayload<object>) => ({
  fullName: row.fullName,
  email: row.email,
  phone: row.phone,
  licenseNumber: row.licenseNumber,
  licenseType: row.licenseType,
  licenseExpiresOn: toIsoDay(row.licenseExpiresOn),
  baseSalary: row.baseSalary.toNumber(),
  branchId: row.branchId,
  active: row.active,
  version: row.version,
});

export const toDriver = (row: DriverRow): Driver => ({
  id: row.id,
  ...fields(row),
  assignedBusPlate: row.assignedBus?.plate ?? null,
  completedTrips: row.completedTrips,
  hasPhoto: row.photoKey !== null,
});

export const toDriverPayload = (row: Prisma.DriverGetPayload<object>): DriverChangedPayload => ({
  driverId: row.id,
  ...fields(row),
});
