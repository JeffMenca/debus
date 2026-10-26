'use client';

import type { PageQuery } from '@debus/contracts';
import { useUrlQuery } from '@/hooks/use-url-query';
import { readPage, writePage } from '@/lib/list/page-params';
import { RentalHistory } from './rental-history';
import { RentalRequestCard } from './rental-request-card';

const readHistoryPage = (search: URLSearchParams): PageQuery => readPage(search);
function writeHistoryPage(view: PageQuery): URLSearchParams {
  const params = new URLSearchParams();
  writePage(params, view);
  return params;
}

export function RentalRequestScreen() {
  const [query, update] = useUrlQuery(readHistoryPage, writeHistoryPage);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[36px] leading-none font-bold sm:text-[44px]">
          Alquila un bus
        </h1>
        <p className="max-w-[620px] text-[17px] text-muted-foreground">
          Un bus completo con chofer para tu familia, tu institución o tu empresa.
        </p>
      </header>
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[420px_minmax(0,1fr)] lg:items-start">
        <RentalRequestCard />
        <section aria-labelledby="rental-history-title" className="flex min-w-0 flex-col gap-4">
          <h2 id="rental-history-title" className="font-display text-[26px] leading-none font-bold">
            Tus alquileres
          </h2>
          <RentalHistory query={query} onChange={update} />
        </section>
      </div>
    </div>
  );
}
