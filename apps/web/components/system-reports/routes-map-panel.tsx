import type { SystemMapRoute } from '@debus/contracts';
import { Route } from 'lucide-react';
import { KPI_TONE_SURFACES, type KpiTone } from '@/components/data/kpi-card';
import { formatKm, formatQuetzales } from '@/lib/format';
import { cn } from '@/lib/utils';

interface RoutesMapPanelProps {
  // The branch the routes start from; null when no branch has an active route.
  origin: { name: string; activeRoutes: number } | null;
  routes: SystemMapRoute[];
}

const TONES: KpiTone[] = ['indigo', 'mint', 'coral', 'mango'];

const activeLabel = (count: number) => (count === 1 ? '1 ruta activa' : `${count} rutas activas`);
const ticketsLabel = (count: number) =>
  `${count} ${count === 1 ? 'boleto vendido' : 'boletos vendidos'}`;

// What the list says when it draws no route; a branch whose routes only lack a place on the map
// says nothing here, the note below explains it.
function emptyMessageOf(origin: RoutesMapPanelProps['origin']): string | null {
  if (!origin) return 'Todavía no hay rutas activas en ninguna sucursal';
  return origin.activeRoutes > 0 ? null : 'Esta sucursal aún no tiene rutas activas';
}

// The routes the map draws, one by one, for whoever reads the list instead of the map.
export function RoutesMapPanel({ origin, routes }: RoutesMapPanelProps) {
  const emptyMessage = emptyMessageOf(origin);
  return (
    <section
      aria-label="Rutas de la sucursal"
      className="flex min-w-0 flex-1 basis-80 animate-arrive flex-col gap-3.5 rounded-[26px] bg-card p-6 motion-reduce:animate-none"
    >
      {origin ? (
        <div className="flex flex-col gap-1 rounded-[20px] bg-indigo-100 p-[18px] text-indigo-700">
          <span className="text-[13px] font-semibold">Desde</span>
          <h2 className="font-display text-[26px] leading-tight font-bold text-foreground">
            {origin.name}
          </h2>
          <span className="text-sm font-medium">{activeLabel(origin.activeRoutes)}</span>
        </div>
      ) : null}

      {routes.length > 0 ? (
        <ul aria-label="Rutas activas" className="flex flex-col">
          {routes.map((route, index) => (
            <li key={route.routeId} className="flex items-center gap-3.5 rounded-[14px] px-2 py-3">
              <span
                className={cn(
                  'flex size-[42px] shrink-0 items-center justify-center rounded-[13px]',
                  KPI_TONE_SURFACES[TONES[index % TONES.length]!],
                )}
              >
                <Route aria-hidden strokeWidth={1.75} className="size-5" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-bold">{route.destinationName}</span>
                <span className="text-[13px] text-muted-foreground">
                  {`${formatKm(route.distanceKm)} · ${ticketsLabel(route.tickets)}`}
                </span>
              </div>
              <span className="font-mono font-semibold tabular-nums">
                {formatQuetzales(route.ticketPrice)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        emptyMessage && (
          <p className="px-2 py-6 text-center text-muted-foreground">{emptyMessage}</p>
        )
      )}

      {origin && origin.activeRoutes > routes.length && (
        <p className="text-xs leading-normal text-muted-foreground">
          Alguna ruta no aparece porque su destino todavía no tiene ubicación en el mapa.
        </p>
      )}
    </section>
  );
}
