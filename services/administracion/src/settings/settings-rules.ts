// Dates are YYYY-MM-DD in the Guatemala calendar, so text comparison is date comparison.
export function canScheduleSettings(effectiveFrom: string, today: string): boolean {
  return effectiveFrom >= today;
}
