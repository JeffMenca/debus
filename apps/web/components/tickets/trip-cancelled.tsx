import { CalendarX2 } from 'lucide-react';
import Link from 'next/link';
import { FormAlert } from '@/components/auth/form-alert';
import { Button } from '@/components/ui/button';

interface TripCancelledProps {
  // What ventas answered, which already says whether money comes back.
  message: string;
  back: string;
}

// The end of a purchase whose trip was deleted: nothing left to choose, only where to go next.
export function TripCancelled({ message, back }: TripCancelledProps) {
  return (
    <section
      aria-labelledby="trip-cancelled-title"
      className="mx-auto flex w-full max-w-lg animate-arrive flex-col gap-5 rounded-[26px] bg-card p-6 motion-reduce:animate-none"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-coral-100 text-coral-700">
          <CalendarX2 aria-hidden strokeWidth={1.75} className="size-6" />
        </span>
        <h1 id="trip-cancelled-title" className="font-display text-[26px] font-bold">
          Viaje cancelado
        </h1>
      </div>
      <FormAlert tone="info">{message}</FormAlert>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild className="sm:flex-1">
          <Link href={back}>Buscar otro viaje</Link>
        </Button>
        <Button asChild variant="ghost" className="sm:flex-1">
          <Link href="/cuenta?pestana=movimientos">Ver mis movimientos</Link>
        </Button>
      </div>
    </section>
  );
}
