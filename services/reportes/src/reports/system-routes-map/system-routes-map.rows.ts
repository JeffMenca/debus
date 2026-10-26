import type { SystemMapBranch, SystemMapRoute } from '@debus/contracts';

export interface MapBranchRecord {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  routes: number;
}
export interface MapRouteRecord {
  route_id: string;
  destination_branch_id: string;
  destination_name: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  ticket_price: number;
  tickets: number;
}

export const toMapBranch = (record: MapBranchRecord): SystemMapBranch => ({
  id: record.id,
  name: record.name,
  latitude: record.latitude,
  longitude: record.longitude,
  routes: record.routes,
});

export const toMapRoute = (record: MapRouteRecord): SystemMapRoute => ({
  routeId: record.route_id,
  destinationBranchId: record.destination_branch_id,
  destinationName: record.destination_name,
  latitude: record.latitude,
  longitude: record.longitude,
  distanceKm: record.distance_km,
  ticketPrice: record.ticket_price,
  tickets: record.tickets,
});

// The branch that was asked for, even if it has no routes; otherwise the first one (the branches
// come in alphabetical order) that has active routes.
export const selectedBranchOf = (
  branches: SystemMapBranch[],
  requested: string | undefined,
): string | null => requested ?? branches.find((branch) => branch.routes > 0)?.id ?? null;
