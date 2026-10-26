import type { Session } from '../gateway-client';
import { runFleet } from '../stages/fleet';
import { runOperations } from '../stages/operations';
import { runStructure } from '../stages/structure';
import type { FakeGateway } from './fake-gateway';
import type { Row } from './fake-support';
import { NOW, TODAY, setup } from './setup';

export const BRANCH_ID = '00000000-0000-4000-8000-0000000b0001';
export const OTHER_BRANCH_ID = '00000000-0000-4000-8000-0000000b0002';

// A session for a request that goes straight to a fake extension, which only looks at the user.
export function sessionOf(
  role: 'CLIENT' | 'CASHIER' | 'BRANCH_ADMIN',
  id: string,
  branchId: string | null = null,
): Session {
  return {
    accessToken: 'token',
    user: { id, fullName: 'Persona', email: `${id}@debus.test`, role, branchId },
  };
}

// A regular trip that leaves in `hours` hours from the point of view of the fake clock.
export function addTrip(
  gateway: FakeGateway,
  id: string,
  options: { hours?: number; branchId?: string; price?: number; capacity?: number } = {},
): Row {
  const { hours = 24 * 5, branchId = BRANCH_ID, price = 85, capacity = 44 } = options;
  const departureAt = new Date(gateway.now().getTime() + hours * 3_600_000).toISOString();
  const trip: Row = {
    id,
    type: 'REGULAR',
    status: 'SCHEDULED',
    branchId,
    routeId: `route-${id}`,
    originName: 'Ciudad de Guatemala',
    destinationName: 'Quetzaltenango',
    busId: `bus-${id}`,
    busPlate: 'C100BTX',
    driverId: `driver-${id}`,
    driverName: 'Chofer',
    departureAt,
    estimatedArrivalAt: new Date(Date.parse(departureAt) + 4 * 3_600_000).toISOString(),
    ticketPrice: price,
    capacity,
    departedAt: null,
  };
  gateway.trips.push(trip);
  return trip;
}

// The world the demo sales start from: the branches, the fleet and the trips of the operation of
// the day, built with the real stages against the fake gateway.
export async function readyWorld(now: Date = NOW, today: string = TODAY) {
  const world = setup(now, today);
  await runStructure(world.ctx);
  await runFleet(world.ctx);
  await runOperations(world.ctx);
  return world;
}
