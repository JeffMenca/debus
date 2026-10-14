'use client';

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
  return (
    <div className="max-w-full overflow-x-auto">
      <Tabs value={value} onValueChange={(next) => onChange(next as V)}>
        <TabsList
          aria-label={label}
          // Equal columns that never get narrower than their longest word and count: the bar takes the
          // width it needs up to the screen, wraps a long label when that is enough and scrolls
          // inside its frame when even that does not fit.
          className="relative grid w-fit min-w-full items-stretch gap-0 rounded-2xl bg-muted-2 p-1 group-data-horizontal/tabs:h-auto sm:min-w-0"
          style={{ gridTemplateColumns: `repeat(${options.length}, minmax(min-content, 1fr))` }}
        >
          <span
            aria-hidden
            className="absolute top-1 bottom-1 left-1 rounded-xl bg-card shadow-tab transition-transform duration-500 ease-[var(--ease-spring)] motion-reduce:transition-none"
            style={{
              width: `calc((100% - 8px) / ${options.length})`,
              transform: `translateX(${index * 100}%)`,
            }}
          />
          {options.map((option) => (
            <TabsTrigger
              key={option.value}
              value={option.value}
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
