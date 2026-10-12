'use client';

import Link from 'next/link';
import { BusAndDriver } from '@/components/trips/trip-columns';
import { useTripsPage } from '@/hooks/use-trips';
import { splitGuatemala } from '@/lib/trips/schedule';
import { Panel, PanelContent } from './panel';

const SHOWN = 5;

// The query is shared with the "scheduled departures" card, so both read one answer.
export const departuresOf = (day: string) =>
  ({ from: day, to: day, status: 'SCHEDULED', page: 1, pageSize: SHOWN }) as const;

export function UpcomingDepartures({ day }: { day: string }) {
  const departures = useTripsPage(departuresOf(day));

  return (
    <Panel
      title="Próximas salidas"
      aside={
        <Link
          href={`/sucursal/viajes?desde=${day}&hasta=${day}`}
          className="text-sm font-semibold text-primary hover:text-primary/80"
        >
          Ver todos los viajes
        </Link>
      }
    >
      <PanelContent
        query={departures}
        errorMessage="No pudimos cargar las salidas."
        empty="No hay salidas programadas para este día."
      >
        {({ items }) => (
          <div className="overflow-x-auto">
            <table aria-label="Próximas salidas" className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="bg-background text-left text-muted-foreground">
                  <th scope="col" className="rounded-l-xl px-3.5 py-2.5 font-medium">
                    Hora
                  </th>
                  <th scope="col" className="px-3.5 py-2.5 font-medium">
                    Ruta
                  </th>
                  <th scope="col" className="rounded-r-xl px-3.5 py-2.5 font-medium">
                    Bus y chofer
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((trip) => (
                  <tr key={trip.id} className="transition-colors hover:bg-background/60">
                    <td className="border-b border-muted px-3.5 py-3 font-mono font-semibold tabular-nums">
                      {splitGuatemala(trip.departureAt).time}
                    </td>
                    <td className="border-b border-muted px-3.5 py-3">
                      {trip.originName} → {trip.destinationName}
                    </td>
                    <td className="border-b border-muted px-3.5 py-3">
                      <BusAndDriver trip={trip} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelContent>
    </Panel>
  );
}
