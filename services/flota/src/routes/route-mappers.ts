import type { Route, RouteChangedPayload } from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';

export const ROUTE_INCLUDE = {
  origin: { select: { name: true } },
  destination: { select: { name: true } },
} as const;
type RouteRow = Prisma.RouteGetPayload<{ include: typeof ROUTE_INCLUDE }>;

export const toRoute = (row: RouteRow): Route => ({
  id: row.id,
  originBranchId: row.originBranchId,
  originName: row.origin.name,
  destinationBranchId: row.destinationBranchId,
  destinationName: row.destination.name,
  distanceKm: row.distanceKm.toNumber(),
  ticketPrice: row.ticketPrice.toNumber(),
  active: row.active,
  hasTrips: row.hasTrips,
  version: row.version,
});

export const toRoutePayload = (row: Prisma.RouteGetPayload<object>): RouteChangedPayload => ({
  routeId: row.id,
  originBranchId: row.originBranchId,
  destinationBranchId: row.destinationBranchId,
  distanceKm: row.distanceKm.toNumber(),
  ticketPrice: row.ticketPrice.toNumber(),
  active: row.active,
  version: row.version,
});
