import { formatSeat } from '@/lib/tickets/counter-sale';
import { cn } from '@/lib/utils';

export type SeatState = 'free' | 'selected' | 'taken';

interface SeatButtonProps {
  seat: number;
  state: SeatState;
  disabled?: boolean;
  onToggle: (seat: number) => void;
}

const label = (seat: number, state: SeatState) =>
  state === 'taken' ? `Asiento ${seat}, ocupado` : `Asiento ${seat}`;

// A seat seen from above: the bar at the bottom is its cushion.
export function SeatButton({ seat, state, disabled = false, onToggle }: SeatButtonProps) {
  const taken = state === 'taken';
  const selected = state === 'selected';
  return (
    <button
      type="button"
      aria-label={label(seat, state)}
      aria-pressed={taken ? undefined : selected}
      disabled={taken || disabled}
      onClick={() => onToggle(seat)}
      className={cn(
        'relative h-12 w-11 rounded-t-[15px] rounded-b-[9px] font-mono text-[13px] font-medium transition-[background-color,color,transform] duration-200 sm:h-[50px] sm:w-12',
        'after:absolute after:inset-x-2 after:bottom-1.5 after:h-1 after:rounded-[3px] after:content-[""]',
        taken && 'cursor-not-allowed bg-muted-2 text-muted-foreground after:bg-muted',
        selected &&
          'animate-seat bg-primary text-primary-foreground after:bg-mango-300 motion-reduce:animate-none',
        state === 'free' &&
          'bg-card text-foreground after:bg-muted-2 enabled:hover:-translate-y-0.5 enabled:hover:bg-secondary disabled:opacity-50 motion-reduce:enabled:hover:translate-y-0',
      )}
    >
      {formatSeat(seat)}
    </button>
  );
}
