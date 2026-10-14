'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface StatusTabsProps<V extends string> {
  label: string;
  value: V;
  options: { value: V; label: string; count?: number }[];
  onChange: (value: V) => void;
}

export function StatusTabs<V extends string>({
  label,
  value,
  options,
  onChange,
}: StatusTabsProps<V>) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const listRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  // Columns can differ when the bar scrolls, so the indicator follows the real tab, not 1/n.
  useLayoutEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>(`[data-tab-index="${index}"]`);
    if (!list || !active) return;
    const frame = list.closest<HTMLElement>('[data-tabs-frame]');
    const measure = () => {
      // A hidden bar has no layout yet: keep the first-paint estimate until it has one.
      if (active.offsetWidth === 0) return;
      setBox({ left: active.offsetLeft, width: active.offsetWidth });
      if (!frame) return;
      const right = active.offsetLeft + active.offsetWidth;
      if (active.offsetLeft < frame.scrollLeft) frame.scrollLeft = active.offsetLeft;
      else if (right > frame.scrollLeft + frame.clientWidth) {
        frame.scrollLeft = right - frame.clientWidth;
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    // Counts arrive after the first paint and widen the columns: measure and reveal again.
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [index, options.length]);

  return (
    <div data-tabs-frame className="max-w-full overflow-x-auto">
      <Tabs value={value} onValueChange={(next) => onChange(next as V)}>
        <TabsList
          ref={listRef}
          aria-label={label}
          // Equal columns that never get narrower than their longest word and count: the bar takes the
          // width it needs up to the screen, wraps a long label when that is enough and scrolls
          // inside its frame when even that does not fit.
          className="relative grid w-fit min-w-full items-stretch gap-0 rounded-2xl bg-muted-2 p-1 group-data-horizontal/tabs:h-auto sm:min-w-0"
          style={{ gridTemplateColumns: `repeat(${options.length}, minmax(min-content, 1fr))` }}
        >
          <span
            aria-hidden
            data-testid="tab-indicator"
            className="absolute top-1 bottom-1 left-0 rounded-xl bg-card shadow-tab transition-transform duration-500 ease-[var(--ease-spring)] motion-reduce:transition-none"
            style={
              box
                ? { width: box.width, transform: `translateX(${box.left}px)` }
                : {
                    left: 4,
                    width: `calc((100% - 8px) / ${options.length})`,
                    transform: `translateX(${index * 100}%)`,
                  }
            }
          />
          {options.map((option, position) => (
            <TabsTrigger
              key={option.value}
              value={option.value}
              data-tab-index={position}
              className="relative z-10 h-auto min-h-10 min-w-0 gap-2 rounded-xl border-0 bg-transparent px-3 py-1.5 text-center text-sm leading-tight font-semibold whitespace-normal data-active:bg-transparent group-data-[variant=default]/tabs-list:data-active:shadow-none sm:min-w-[112px] sm:px-4"
            >
              {option.label}
              {option.count !== undefined && (
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {option.count}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
