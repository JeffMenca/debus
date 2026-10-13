import type { Bus, BusChangedPayload } from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';
import { busDisplayStatus } from './bus-rules';

export const BUS_INCLUDE = { assignedDriver: { select: { fullName: true } } } as const;
type BusRow = Prisma.BusGetPayload<{ include: typeof BUS_INCLUDE }>;

export const toBus = (row: BusRow): Bus => ({
  id: row.id,
  branchId: row.branchId,
  plate: row.plate,
  brand: row.brand,
  model: row.model,
  year: row.year,
  capacity: row.capacity,
  mileageKm: row.mileageKm,
  operationalStatus: row.operationalStatus,
  assignedDriverId: row.assignedDriverId,
  assignedDriverName: row.assignedDriver?.fullName ?? null,
  active: row.active,
  displayStatus: busDisplayStatus(row),
  completedTrips: row.completedTrips,
  hasPhoto: row.photoKey !== null,
  version: row.version,
});

export const toBusPayload = (row: Prisma.BusGetPayload<object>): BusChangedPayload => ({
  busId: row.id,
  branchId: row.branchId,
  plate: row.plate,
  brand: row.brand,
  model: row.model,
  year: row.year,
  capacity: row.capacity,
  mileageKm: row.mileageKm,
  operationalStatus: row.operationalStatus,
  assignedDriverId: row.assignedDriverId,
  active: row.active,
  version: row.version,
});
