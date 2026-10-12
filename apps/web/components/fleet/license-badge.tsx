import { todayInGuatemala } from '@debus/contracts';
import { KPI_TONE_SURFACES } from '@/components/data/kpi-card';
import { daysUntil, licenseTone } from '@/lib/fleet/license';
import { formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const plural = (days: number) => `${days} ${days === 1 ? 'día' : 'días'}`;

function wording(expiresOn: string, days: number, today: string): string {
  if (days === 0) return 'Vence hoy';
  if (days === 1) return 'Vence mañana';
  if (days === -1) return 'Venció ayer';
  if (days < 0) return `Venció hace ${plural(-days)}`;
  if (days <= 30) return `Vence en ${plural(days)}`;
  return `Vence el ${formatShortDate(expiresOn, expiresOn.slice(0, 4) !== today.slice(0, 4))}`;
}

interface LicenseBadgeProps {
  expiresOn: string;
  // The day to count from; Guatemala's today unless a test says otherwise.
  today?: string;
}

// A licence that is close to expiring stands out; a far one is just a date.
export function LicenseBadge({ expiresOn, today = todayInGuatemala() }: LicenseBadgeProps) {
  const days = daysUntil(expiresOn, today);
  const tone = licenseTone(days);
  return (
    <span
      className={cn(
        'inline-flex rounded-lg px-2.5 py-1 text-sm font-semibold',
        tone === 'muted' ? 'font-medium text-muted-foreground' : KPI_TONE_SURFACES[tone],
      )}
    >
      {wording(expiresOn, days, today)}
    </span>
  );
}
