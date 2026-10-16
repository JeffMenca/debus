import { CircleDot, LogOut } from 'lucide-react';
import { SEAT_LIMIT, seatRows } from '@/lib/tickets/counter-sale';
import { SeatButton, type SeatState } from './seat-button';

interface SeatMapProps {
  capacity: number;
  taken: number[];
  selected: number[];
  onToggle: (seat: number) => void;
}

const LEGEND: { state: SeatState; label: string; swatch: string }[] = [
  { state: 'free', label: 'Libre', swatch: 'bg-card' },
  { state: 'selected', label: 'Elegido', swatch: 'bg-primary' },
  { state: 'taken', label: 'Ocupado', swatch: 'bg-muted-2' },
];

export function SeatLegend() {
  return (
    <ul className="flex flex-wrap gap-4 text-sm font-semibold text-muted-foreground">
      {LEGEND.map(({ state, label, swatch }) => (
        <li key={state} className="flex items-center gap-2">
          <span aria-hidden className={`size-[18px] rounded-md ${swatch}`} />
          {label}
        </li>
      ))}
    </ul>
  );
}

// The bus seen from above, front first: two seats on each side of the aisle.
export function SeatMap({ capacity, taken, selected, onToggle }: SeatMapProps) {
  const full = selected.length >= SEAT_LIMIT;
  function stateOf(seat: number): SeatState {
    if (taken.includes(seat)) return 'taken';
    if (selected.includes(seat)) return 'selected';
    return 'free';
  }
  const seat = (number: number) => (
    <SeatButton
      key={number}
      seat={number}
      state={stateOf(number)}
      disabled={full && !selected.includes(number)}
      onToggle={onToggle}
    />
  );

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-col gap-2.5 rounded-[64px_64px_30px_30px] bg-card px-4 pt-6 pb-7 sm:px-6.5">
        <div className="mb-1.5 flex items-center justify-between border-b-2 border-dashed border-muted-2 px-1 pb-4">
          <span className="flex items-center gap-2 rounded-[10px] bg-mint-100 px-2.5 py-1.5 text-xs font-bold text-mint-700">
            <LogOut aria-hidden strokeWidth={1.75} className="size-4" />
            Puerta
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">FRENTE</span>
          <span
            role="img"
            aria-label="Piloto"
            className="flex size-11 items-center justify-center rounded-full bg-mango-100 text-mango-700"
          >
            <CircleDot aria-hidden strokeWidth={1.75} className="size-5" />
          </span>
        </div>
        {seatRows(capacity).map((row, index) => (
          <div key={row.left[0]} className="flex items-center gap-2 sm:gap-2.5">
            {row.left.map(seat)}
            <span
              aria-hidden
              className="w-7 text-center font-mono text-[11px] text-muted-foreground sm:w-9"
            >
              {index + 1}
            </span>
            {row.right.map(seat)}
          </div>
        ))}
      </div>
      {full && (
        <p role="status" className="text-sm text-muted-foreground">
          Ya elegiste {SEAT_LIMIT} asientos, lo más que lleva una venta.
        </p>
      )}
    </div>
  );
}
