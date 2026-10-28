import { ApiError } from '@/lib/api/client';
import type { ReactNode } from 'react';

// The seat map answers 404 for a trip that is not on sale and 409 for one that already left: both
// end the sale of that trip, so the person goes back to choose another and retrying makes no sense.
export const isTripGone = (error: unknown): error is ApiError =>
  error instanceof ApiError && (error.status === 404 || error.status === 409);

// A trip that left is not a trip that was not found: the title says which of the two it is.
export const tripGoneTitle = (error: ApiError): string =>
  error.status === 409 ? 'Este viaje ya salió' : 'No encontramos ese viaje';

// What the server said, with the way back (a link or a button) the screen gives.
export function TripMissing({
  message,
  title = 'No encontramos ese viaje',
  children,
}: {
  message: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby="trip-missing-title"
      className="mx-auto flex max-w-lg flex-col items-start gap-4 rounded-[26px] bg-card p-6"
    >
      <h1 id="trip-missing-title" className="font-display text-[26px] font-bold">
        {title}
      </h1>
      <p className="text-muted-foreground">{message}</p>
      {children}
    </section>
  );
}
