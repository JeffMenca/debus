import type { KpiTone } from '@/components/data/kpi-card';

const DAY_MS = 86_400_000;
const utcDay = (isoDay: string) => Date.parse(`${isoDay}T00:00:00Z`);

// Calendar days between two ISO days (negative once the day has passed).
export const daysUntil = (isoDay: string, today: string): number =>
  Math.round((utcDay(isoDay) - utcDay(today)) / DAY_MS);

export const URGENT_LICENSE_DAYS = 15;
export const SOON_LICENSE_DAYS = 30;

export function licenseTone(days: number): Extract<KpiTone, 'coral' | 'mango'> | 'muted' {
  if (days <= URGENT_LICENSE_DAYS) return 'coral';
  return days <= SOON_LICENSE_DAYS ? 'mango' : 'muted';
}
