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
          className="relative flex w-max gap-0 rounded-2xl bg-muted-2 p-1 group-data-horizontal/tabs:h-auto"
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
              className="relative z-10 h-10 min-w-[112px] flex-1 gap-2 rounded-xl border-0 bg-transparent px-4 text-sm font-semibold data-active:bg-transparent group-data-[variant=default]/tabs-list:data-active:shadow-none"
            >
              {option.label}
              {option.count !== undefined && (
                <span className="text-xs font-medium text-muted-foreground">{option.count}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
