'use client';

import {
  type ColumnDef,
  type RowData,
  createColumnHelper,
  functionalUpdate,
  rowPaginationFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { FileDown } from 'lucide-react';
import type { PageQuery } from '@debus/contracts';
import { Fragment, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorAlert } from './error-alert';
import { TablePagination } from './table-pagination';

export const dataTableFeatures = tableFeatures({ rowPaginationFeature });
export type DataTableFeatures = typeof dataTableFeatures;
export const columnHelperFor = <T extends RowData>() => createColumnHelper<DataTableFeatures, T>();

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

// A list whose page lives in the address hands its paging to the table this way.
export function tablePagination(
  query: PageQuery,
  total: number | undefined,
  update: (patch: Partial<PageQuery>) => void,
): DataTablePagination {
  return {
    page: query.page,
    pageSize: query.pageSize,
    total: total ?? 0,
    onPageChange: (page) => update({ page }),
    onPageSizeChange: (pageSize) => update({ pageSize }),
  };
}

interface DataTableProps<T extends RowData> {
  caption: string;
  columns: ColumnDef<DataTableFeatures, T>[];
  data: T[];
  getRowId?: (row: T) => string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyMessage: string;
  summary?: string;
  footerNote?: ReactNode;
  minWidth?: number;
  onExport?: () => void;
  pagination?: DataTablePagination;
  // The next page is on its way: the table stays, dimmed, instead of going back to the skeleton.
  isRefreshing?: boolean;
  // Rows that show a detail under them, such as a bus with its categories; the screen decides which
  // are open (by row id) and what each one shows.
  expandedRowIds?: ReadonlySet<string>;
  renderDetail?: (row: T) => ReactNode;
}

// The server filters and pages before passing `data`; this component only paints the table.
export function DataTable<T extends RowData>({
  caption,
  columns,
  data,
  getRowId,
  isLoading,
  error,
  onRetry,
  emptyMessage,
  summary,
  footerNote,
  minWidth = 720,
  onExport,
  pagination,
  isRefreshing,
  expandedRowIds,
  renderDetail,
}: DataTableProps<T>) {
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    ...(getRowId && { getRowId }),
    // The server already sliced the rows; the table only learns how many there are in total.
    manualPagination: true,
    rowCount: pagination?.total ?? data.length,
    ...(pagination && {
      state: { pagination: { pageIndex: pagination.page - 1, pageSize: pagination.pageSize } },
      onPaginationChange: (updater) => {
        const current = { pageIndex: pagination.page - 1, pageSize: pagination.pageSize };
        const next = functionalUpdate(updater, current);
        if (next.pageSize !== current.pageSize) pagination.onPageSizeChange(next.pageSize);
        else pagination.onPageChange(next.pageIndex + 1);
      },
    }),
  });
  const rows = table.getRowModel().rows;
  const rowsBefore = pagination ? (pagination.page - 1) * pagination.pageSize : 0;
  // With a pager the row count is already on screen, so the summary would repeat it.
  const footerSummary = pagination ? undefined : summary;

  return (
    <section
      aria-busy={isRefreshing || undefined}
      className="flex flex-col gap-3 rounded-[26px] bg-card p-3"
    >
      {onExport && (
        <div className="flex justify-end px-2 pt-1">
          <Button variant="secondary" onClick={onExport}>
            <FileDown aria-hidden strokeWidth={1.75} className="size-4.5" />
            Exportar PDF
          </Button>
        </div>
      )}
      {error ? (
        <ErrorAlert message={error} onRetry={onRetry} />
      ) : (
        <div className="overflow-x-auto">
          <table
            aria-label={caption}
            className="w-full border-separate border-spacing-0 text-sm"
            style={{ minWidth }}
          >
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      className="relative bg-background px-3.5 py-3 text-left font-medium text-muted-foreground first:rounded-l-xl last:rounded-r-xl"
                    >
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody
              className={
                isRefreshing
                  ? 'opacity-60 transition-opacity motion-reduce:transition-none'
                  : undefined
              }
            >
              {isLoading ? (
                <tr aria-label="Cargando">
                  <td colSpan={columns.length} className="p-2">
                    {Array.from({ length: 5 }, (_, index) => (
                      <div
                        key={index}
                        className="my-2 h-11 animate-shimmer rounded-lg bg-muted motion-reduce:animate-none"
                      />
                    ))}
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <Fragment key={row.id}>
                    <tr
                      className="animate-arrive transition-colors hover:bg-background/60 motion-reduce:animate-none"
                      style={{ animationDelay: `${Math.min(index, 7) * 60}ms` }}
                    >
                      {row.getAllCells().map((cell) => (
                        <td key={cell.id} className="relative border-b border-muted px-3.5 py-2.5">
                          <table.FlexRender cell={cell} />
                        </td>
                      ))}
                    </tr>
                    {renderDetail && expandedRowIds?.has(row.id) && (
                      <tr>
                        <td
                          colSpan={columns.length}
                          className="border-b border-muted bg-background/60 px-3.5 py-3"
                        >
                          {renderDetail(row.original)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {!error && !isLoading && rows.length === 0 && (
        <p className="px-3.5 py-10 text-center text-muted-foreground">{emptyMessage}</p>
      )}
      {pagination && pagination.total > 0 && (
        <TablePagination
          page={pagination.page}
          pageCount={table.getPageCount()}
          pageSize={pagination.pageSize}
          total={pagination.total}
          from={rowsBefore + 1}
          to={rowsBefore + data.length}
          canPrevious={table.getCanPreviousPage()}
          canNext={table.getCanNextPage()}
          onFirst={table.firstPage}
          onPrevious={table.previousPage}
          onNext={table.nextPage}
          onLast={table.lastPage}
          onPageSizeChange={table.setPageSize}
        />
      )}
      {(footerSummary || footerNote) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 pb-1 text-[13px] text-muted-foreground">
          <span>{footerSummary}</span>
          {footerNote}
        </div>
      )}
    </section>
  );
}
