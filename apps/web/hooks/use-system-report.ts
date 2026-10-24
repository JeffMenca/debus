'use client';

import { useCallback, useMemo } from 'react';
import type { z } from 'zod';
import type { PageQuery } from '@debus/contracts';
import { usePageInRange } from './use-page-in-range';
import { useReport } from './use-report';
import { useReportPdf } from './use-report-pdf';
import { useUrlQuery } from './use-url-query';

function withoutPage(search: URLSearchParams): URLSearchParams {
  const filters = new URLSearchParams(search);
  filters.delete('page');
  filters.delete('pageSize');
  return filters;
}

interface SystemReportOptions<Q extends PageQuery, T extends { items: unknown[] }> {
  path: string;
  // The name of the PDF file, before the date.
  fileStem: string;
  schema: z.ZodType<T & { total: number; page: number; pageSize: number }>;
  // Module level, so their identity stays stable between renders.
  read: (search: URLSearchParams) => Q;
  write: (query: Q) => URLSearchParams;
  toSearch: (query: Q) => URLSearchParams;
}

// What every paged report of the system administrator shares: the filters live in the address, the
// server filters, pages and adds up, and the PDF asks with the same filters and no page, because it
// carries every filtered row.
export function useSystemReport<Q extends PageQuery, T extends { items: unknown[] }>({
  path,
  fileStem,
  schema,
  read,
  write,
  toSearch,
}: SystemReportOptions<Q, T>) {
  const [query, update] = useUrlQuery(read, write);
  const search = useMemo(() => toSearch(query), [toSearch, query]);
  const report = useReport(path, search, schema);
  const pdfSearch = useMemo(() => withoutPage(search), [search]);
  const { exportPdf, exporting } = useReportPdf(path, pdfSearch, fileStem);
  // `update` only ever turns the page here, which every view has.
  const setPage = useCallback(
    ({ page }: { page: number }) => update({ page } as Partial<Q>),
    [update],
  );
  usePageInRange(report.data, setPage);
  return { query, update, report, exportPdf, exporting };
}
