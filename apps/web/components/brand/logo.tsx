import { Bus as BusIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoProps {
  // `compact` shrinks it on narrow screens, for rows that must also fit other controls.
  compact?: boolean;
  // `light` is for dark backgrounds such as the footer.
  tone?: 'default' | 'light';
  // Inside the sidebar: only the icon stays, smaller, when the sidebar folds.
  collapsible?: boolean;
}

export function Logo({ compact = false, tone = 'default', collapsible = false }: LogoProps) {
  const light = tone === 'light';
  return (
    <div className="flex items-center gap-2.5" aria-label={collapsible ? 'debus' : undefined}>
      <div
        className={cn(
          'flex size-[42px] items-center justify-center rounded-[14px]',
          light
            ? 'bg-sidebar-primary text-sidebar-primary-foreground'
            : 'bg-primary text-mango-300',
          compact && 'max-sm:size-9 max-sm:rounded-xl',
          collapsible &&
            'group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:rounded-[10px]',
        )}
      >
        <BusIcon aria-hidden strokeWidth={1.75} className="size-5" />
      </div>
      <span
        className={cn(
          'font-display text-[26px] font-bold',
          light ? 'text-sidebar-accent-foreground' : 'text-foreground',
          compact && 'max-sm:text-[22px]',
          collapsible && 'group-data-[collapsible=icon]:hidden',
        )}
      >
        debus
      </span>
    </div>
  );
}
