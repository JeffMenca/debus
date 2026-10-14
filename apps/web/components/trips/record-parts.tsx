import type { LucideIcon } from 'lucide-react';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { KPI_TONE_SURFACES, type KpiTone } from '@/components/data/kpi-card';
import { cn } from '@/lib/utils';

// The pieces the departure and arrival cards share, so both read the same.

// The card of a record: white while the form waits, green once the record is saved.
export function RecordSection({
  recorded = false,
  children,
}: {
  recorded?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'flex animate-arrive flex-col gap-4 rounded-[26px] p-5 motion-reduce:animate-none sm:p-6',
        recorded ? 'bg-mint-100 text-mint-700' : 'bg-card',
      )}
    >
      {children}
    </section>
  );
}

export function CardTitle({
  icon: Icon,
  tone,
  children,
}: {
  icon: LucideIcon;
  tone: 'mint' | 'mango';
  children: ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2.5 font-display text-2xl font-bold">
      <span
        aria-hidden
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-[13px]',
          tone === 'mint' ? 'bg-card text-mint-700' : 'bg-mango-100 text-mango-700',
        )}
      >
        <Icon strokeWidth={1.75} className="size-5" />
      </span>
      {children}
    </h2>
  );
}

export function LockedNote() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-mint-700">
      <Lock aria-hidden strokeWidth={1.75} className="size-4" />
      Registrada, no editable
    </span>
  );
}

// A saved value, in white on the green card.
export function Fact({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl bg-card p-3.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('m-0 text-[15px] font-semibold', mono && 'font-mono tabular-nums')}>
        {value}
      </dd>
    </div>
  );
}

// A tinted figure: what the trip covered, what it depreciates, what the driver earns.
export function Figure({
  tone,
  label,
  children,
}: {
  tone: KpiTone;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn('flex min-w-0 flex-col gap-1.5 rounded-[18px] p-4', KPI_TONE_SURFACES[tone])}
    >
      <span className="text-[13px] font-semibold">{label}</span>
      <span className="font-display text-[26px] leading-tight font-bold [overflow-wrap:anywhere]">
        {children}
      </span>
    </div>
  );
}

export const FIGURES_GRID = 'grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-2.5';

const RECORDED_BY = {
  BRANCH_ADMIN: 'Registrada por el admin de sucursal',
  DRIVER: 'Registrada por el chofer',
} as const;

export function RecordedByNote({ role }: { role: keyof typeof RECORDED_BY }) {
  return <span className="mt-auto text-[13px] font-medium">{RECORDED_BY[role]}</span>;
}

// What the confirmation of a departure or an arrival says before saving it for good.
export const CONFIRM_RECORD = {
  description:
    'Después de guardar no se podrá modificar ni eliminar. Revisa los datos una última vez.',
  checkLabel: 'Revisé los datos: no se podrán cambiar',
} as const;

// The rows of the summary a confirmation shows before saving.
export function Summary({ rows }: { rows: [label: string, value: string][] }) {
  return (
    <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 rounded-[18px] bg-background p-4 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="m-0 font-mono tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
