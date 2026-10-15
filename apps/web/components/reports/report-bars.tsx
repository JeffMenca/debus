'use client';

import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

export interface Bar {
  key: string;
  label: string;
  value: number;
}

const COLORS = ['bg-lilac-300', 'bg-indigo-500', 'bg-mint-300', 'bg-coral-300', 'bg-mango-300'];

interface ReportBarsProps {
  title: string;
  items: Bar[];
  format: (value: number) => string;
}

// Horizontal bars measured against the biggest one.
export function ReportBars({ title, items, format }: ReportBarsProps) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const biggest = Math.max(0, ...items.map((item) => item.value));
  return (
    <section className="flex flex-col gap-4 rounded-[26px] bg-card p-6">
      <h2 className="font-display text-[22px] font-bold">{title}</h2>
      <ul className="flex flex-col gap-3">
        {items.map((item, index) => (
          <li
            key={item.key}
            className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 md:grid-cols-[180px_1fr_130px]"
          >
            <span className="text-sm font-semibold">{item.label}</span>
            <span className="font-mono text-sm font-semibold tabular-nums md:order-3 md:text-right">
              {format(item.value)}
            </span>
            <div className="col-span-2 h-[26px] overflow-hidden rounded-[10px] bg-background md:order-2 md:col-span-1">
              <div
                data-testid={`bar-${item.key}`}
                className={cn(
                  'h-full origin-left rounded-[10px]',
                  COLORS[index % COLORS.length],
                  !reduced && 'animate-grow-x',
                )}
                style={{ width: `${biggest === 0 ? 0 : (item.value / biggest) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
