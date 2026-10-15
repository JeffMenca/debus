'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCountUp } from '@/hooks/use-count-up';
import { cn } from '@/lib/utils';

export type KpiTone = 'indigo' | 'mint' | 'mango' | 'coral' | 'lilac' | 'sky';

// The soft background and text of each tone, also used by other tinted tiles such as shortcuts.
export const KPI_TONE_SURFACES: Record<KpiTone, string> = {
  indigo: 'bg-indigo-100 text-indigo-700',
  mint: 'bg-mint-100 text-mint-700',
  mango: 'bg-mango-100 text-mango-700',
  coral: 'bg-coral-100 text-coral-700',
  lilac: 'bg-lilac-100 text-lilac-700',
  sky: 'bg-sky-100 text-sky-700',
};

const CIRCLES: Record<KpiTone, string> = {
  indigo: 'bg-indigo-500',
  mint: 'bg-mint-300',
  mango: 'bg-mango-300',
  coral: 'bg-coral-300',
  lilac: 'bg-lilac-300',
  sky: 'bg-sky-300',
};

interface KpiCardProps {
  tone: KpiTone;
  value: number;
  label: string;
  format?: (value: number) => string;
  icon?: LucideIcon;
  // An illustration on the right, which takes the place of the decorative circle.
  art?: ReactNode;
  // A line under the label that says what the number counts.
  hint?: string;
}

const wholeNumber = (value: number) => Math.round(value).toLocaleString('es-GT');

export function KpiCard({
  tone,
  value,
  label,
  format = wholeNumber,
  icon: Icon,
  art,
  hint,
}: KpiCardProps) {
  const shown = useCountUp(value);
  return (
    <div
      className={cn(
        'relative flex gap-1 overflow-hidden rounded-[22px] px-[18px] py-4',
        art ? 'items-center justify-between gap-3' : 'flex-col',
        KPI_TONE_SURFACES[tone],
      )}
    >
      {!art && (
        <span
          aria-hidden
          className={cn(
            'absolute -top-6 -right-6 size-20 animate-float rounded-full opacity-60 motion-reduce:animate-none',
            CIRCLES[tone],
          )}
        />
      )}
      <div className="relative flex flex-col gap-1">
        {Icon && <Icon aria-hidden strokeWidth={1.75} className="size-5" />}
        <span className="font-display text-[30px] leading-none font-bold tabular-nums">
          {format(shown)}
        </span>
        <span className="text-[13px] font-semibold">{label}</span>
        {hint && <span className="text-xs font-medium">{hint}</span>}
      </div>
      {art}
    </div>
  );
}
