import type { AvailabilityReason } from '@debus/contracts';
import { toIsoDay } from '../drivers/driver-mappers';
import type { BusOperationalStatus } from '../generated/prisma/client';

export interface Verdict {
  available: boolean;
  reason?: AvailabilityReason;
}
interface Window {
  departureAt: Date;
  estimatedArrivalAt: Date;
}

const no = (reason: AvailabilityReason): Verdict => ({ available: false, reason });
const YES: Verdict = { available: true };

// Half-open windows: arriving at 12:00 and leaving at 12:00 do not collide (same rule as the
// tstzrange exclusion constraint of viajes).
export const overlaps = (a: Window, b: Window): boolean =>
  a.departureAt < b.estimatedArrivalAt && b.departureAt < a.estimatedArrivalAt;

export function busVerdict(
  bus: { branchId: string; active: boolean; operationalStatus: BusOperationalStatus } | null,
  branchId: string,
  busy: boolean,
): Verdict {
  if (!bus) return no('NOT_FOUND');
  if (bus.branchId !== branchId) return no('OTHER_BRANCH');
  if (!bus.active) return no('INACTIVE');
  if (bus.operationalStatus === 'IN_WORKSHOP') return no('IN_WORKSHOP');
  return busy ? no('BUSY') : YES;
}

export function driverVerdict(
  driver: { branchId: string; active: boolean; licenseExpiresOn: Date } | null,
  branchId: string,
  departureDay: string,
  busy: boolean,
): Verdict {
  if (!driver) return no('NOT_FOUND');
  if (driver.branchId !== branchId) return no('OTHER_BRANCH');
  if (!driver.active) return no('INACTIVE');
  if (toIsoDay(driver.licenseExpiresOn) < departureDay) return no('LICENSE_EXPIRED');
  return busy ? no('BUSY') : YES;
}
