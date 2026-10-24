'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { ErrorAlert } from '@/components/data/error-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useReportPdf } from '@/hooks/use-report-pdf';
import { SYSTEM_ROUTES_MAP_PATH, useSystemRoutesMap } from '@/hooks/use-system-routes-map';
import { useUrlQuery } from '@/hooks/use-url-query';
import {
  readRoutesMapParams,
  routesMapSearch,
  writeRoutesMapParams,
} from '@/lib/system-reports/routes-map-params';
import { OriginSelector } from './origin-selector';
import { RoutesMapPanel } from './routes-map-panel';
import { SystemReportHeader } from './system-report-header';

function MapLoading() {
  return (
    <div
      role="status"
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 font-semibold text-sky-700"
    >
      <Skeleton className="h-3.5 w-56" />
      <span>Cargando mapa de Guatemala</span>
    </div>
  );
}

// Leaflet needs the browser, so the map is loaded only there.
const RoutesMapCanvas = dynamic(() => import('./routes-map-canvas'), {
  ssr: false,
  loading: MapLoading,
});

function Legend() {
  return (
    <ul className="absolute bottom-4 left-4 z-900 flex flex-col gap-1.5 rounded-2xl bg-card px-3 py-2.5 text-xs shadow-float md:gap-2 md:px-3.5 md:py-3 md:text-[13px]">
      <li className="flex items-center gap-2.5">
        <span aria-hidden className="size-3.5 rounded-full bg-primary" />
        Sucursal de origen
      </li>
      <li className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="size-3.5 rounded-full bg-card ring-4 ring-inset ring-primary"
        />
        Destino con ruta
      </li>
      <li className="flex items-center gap-2.5">
        <span aria-hidden className="size-3.5 rounded-[5px] bg-mango-300" />
        Bus de ejemplo
      </li>
    </ul>
  );
}

const UNKNOWN_BRANCH = 'Sucursal sin datos';

// The active routes of one branch drawn over Guatemala, with the same routes listed beside the
// map; the PDF is the table of those routes.
export function RoutesMapReport() {
  const [query, update] = useUrlQuery(readRoutesMapParams, writeRoutesMapParams);
  const map = useSystemRoutesMap(query.branchId);
  const data = map.data;
  const shown = data?.selectedBranchId ?? undefined;
  const pdfSearch = useMemo(() => routesMapSearch(shown), [shown]);
  const { exportPdf, exporting } = useReportPdf(
    SYSTEM_ROUTES_MAP_PATH,
    pdfSearch,
    'reporte-mapa-rutas',
  );

  const selected = data?.branches.find((branch) => branch.id === data.selectedBranchId);
  const origin = data?.selectedBranchId
    ? { name: selected?.name ?? UNKNOWN_BRANCH, activeRoutes: selected?.routes ?? 0 }
    : null;

  return (
    <>
      <SystemReportHeader
        title="Mapa de rutas"
        scope="rutas por sucursal de origen"
        onExport={exportPdf}
        exporting={exporting}
        disabled={!data}
      />

      {map.isError ? (
        <ErrorAlert message="No pudimos cargar el mapa." onRetry={() => void map.refetch()} />
      ) : (
        <>
          {data && (
            <OriginSelector
              branches={data.branches}
              value={query.branchId ?? data.selectedBranchId}
              onChange={(branchId) => update({ branchId })}
            />
          )}
          <div className="flex flex-wrap items-stretch gap-4">
            <section
              aria-label="Mapa de Guatemala"
              aria-busy={map.isPlaceholderData || undefined}
              className="relative h-[420px] min-w-0 flex-[999_1_520px] animate-arrive overflow-hidden rounded-[30px] bg-sky-100 md:h-[640px] motion-reduce:animate-none"
            >
              {data ? (
                <>
                  <RoutesMapCanvas
                    branches={data.branches}
                    selectedBranchId={data.selectedBranchId}
                    routes={data.routes}
                  />
                  <Legend />
                </>
              ) : (
                <MapLoading />
              )}
            </section>
            {data ? (
              <RoutesMapPanel origin={origin} routes={data.routes} />
            ) : (
              <Skeleton className="min-h-80 min-w-0 flex-1 basis-80 rounded-[26px]" />
            )}
          </div>
        </>
      )}
    </>
  );
}
