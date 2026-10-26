import { dayChip, stripStart, weekStrip } from '@/lib/tickets/trip-search-params';
import { cn } from '@/lib/utils';

interface DayStripProps {
  value: string;
  onChange: (day: string) => void;
}

// Six days to jump between without opening the calendar.
export function DayStrip({ value, onChange }: DayStripProps) {
  return (
    <ul aria-label="Días de salida" className="grid grid-cols-6 gap-1.5 sm:gap-2">
      {weekStrip(stripStart(value)).map((day) => {
        const chip = dayChip(day);
        const chosen = day === value;
        return (
          <li key={day}>
            <button
              type="button"
              aria-label={chip.label}
              aria-pressed={chosen}
              onClick={() => onChange(day)}
              className={cn(
                'flex h-15 w-full min-w-11 flex-col items-center justify-center rounded-[14px] transition-colors motion-reduce:transition-none sm:w-[72px]',
                'outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
                chosen ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-secondary',
              )}
            >
              <span className={cn('text-xs', !chosen && 'text-muted-foreground')}>
                {chip.weekday}
              </span>
              <span className="font-display text-xl leading-tight font-bold">{chip.day}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
