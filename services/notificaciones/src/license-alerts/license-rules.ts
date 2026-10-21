// Days before the licence expires when the driver and the branch admins are warned.
export const LICENSE_THRESHOLDS = [3, 15, 30] as const;
export type LicenseThreshold = (typeof LICENSE_THRESHOLDS)[number];

export const DAY_MS = 86_400_000;
const utc = (isoDate: string): number => Date.parse(`${isoDate}T00:00:00.000Z`);

// A calendar date is stored as midnight UTC.
export const toDate = (isoDate: string): Date => new Date(utc(isoDate));
export const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

export const daysUntil = (expiresOn: string, today: string): number =>
  Math.round((utc(expiresOn) - utc(today)) / DAY_MS);

export const addDays = (isoDate: string, days: number): string =>
  toIsoDate(new Date(utc(isoDate) + days * DAY_MS));

// The closest threshold already reached, while the licence is still valid. Only that one is sent:
// a day without the job catches up the next one, and a new driver never gets three alerts at once.
export function dueThreshold(expiresOn: string, today: string): LicenseThreshold | null {
  const days = daysUntil(expiresOn, today);
  if (days < 0) return null;
  return LICENSE_THRESHOLDS.find((threshold) => days <= threshold) ?? null;
}

export interface LicenseHolder {
  email: string;
  branchId: string;
  licenseExpiresOn: string;
  active: boolean;
}

// A pending alert written for the old data must not go out.
export const alertsOutdated = (before: LicenseHolder, after: LicenseHolder): boolean =>
  before.licenseExpiresOn !== after.licenseExpiresOn ||
  before.email !== after.email ||
  before.branchId !== after.branchId ||
  !after.active;
