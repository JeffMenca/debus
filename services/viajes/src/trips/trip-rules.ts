import type { Availability, AvailabilityReason } from '@debus/contracts';
import type { TripProblem } from './trip-messages';

interface ScheduleInput<R, B, D> {
  branchId: string;
  route: R | null;
  bus: B | null;
  driver: D | null;
  departureAt: string;
  now: Date;
}

export type ScheduleCheck<R, B, D> =
  { ok: true; route: R; bus: B; driver: D } | { ok: false; problem: TripProblem };

const refuse = (problem: TripProblem): { ok: false; problem: TripProblem } => ({
  ok: false,
  problem,
});

// Checks the local copies in the order a person fixes them: route, bus, driver, then the clock. On
// success it hands back the three, already known to exist.
export function scheduleProblem<
  R extends { originBranchId: string | null; active: boolean; deleted: boolean },
  B extends { active: boolean },
  D extends { active: boolean },
>({
  branchId,
  route,
  bus,
  driver,
  departureAt,
  now,
}: ScheduleInput<R, B, D>): ScheduleCheck<R, B, D> {
  if (!route || route.deleted || route.originBranchId !== branchId) return refuse('routeNotFound');
  if (!route.active) return refuse('routeRetired');
  if (!bus) return refuse('busPending');
  if (!bus.active) return refuse('busInactive');
  if (!driver) return refuse('driverPending');
  if (!driver.active) return refuse('driverInactive');
  if (new Date(departureAt) <= now) return refuse('departureInPast');
  return { ok: true, route, bus, driver };
}

const BUS: Record<AvailabilityReason, TripProblem> = {
  NOT_FOUND: 'busNotFound',
  OTHER_BRANCH: 'busNotFound',
  INACTIVE: 'busInactive',
  IN_WORKSHOP: 'busInWorkshop',
  LICENSE_EXPIRED: 'busNotFound',
  BUSY: 'busBusy',
};
const DRIVER: Record<AvailabilityReason, TripProblem> = {
  NOT_FOUND: 'driverNotFound',
  OTHER_BRANCH: 'driverNotFound',
  INACTIVE: 'driverInactive',
  IN_WORKSHOP: 'driverNotFound',
  LICENSE_EXPIRED: 'driverLicenseExpired',
  BUSY: 'driverBusy',
};

export function availabilityProblem({ bus, driver }: Availability): TripProblem | null {
  if (!bus.available) return BUS[bus.reason ?? 'NOT_FOUND'];
  if (!driver.available) return DRIVER[driver.reason ?? 'NOT_FOUND'];
  return null;
}

// Neither end of a trip may be a branch that was deactivated.
export function branchesProblem(
  origin: { active: boolean } | null,
  destination: { active: boolean } | null,
): TripProblem | null {
  if (!origin || !destination) return 'routeNotFound';
  if (!origin.active) return 'branchInactive';
  if (!destination.active) return 'destinationInactive';
  return null;
}
