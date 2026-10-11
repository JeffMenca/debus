'use client';

import {
  type ColumnDef,
  type RowData,
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { FileDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export const dataTableFeatures = tableFeatures({});
export type DataTableFeatures = typeof dataTableFeatures;
export const columnHelperFor = <T extends RowData>() => createColumnHelper<DataTableFeatures, T>();

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
}

// The page filters and sorts before passing `data`; this component only paints the table.
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
}: DataTableProps<T>) {
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    ...(getRowId && { getRowId }),
  });
  const rows = table.getRowModel().rows;

  return (
    <section className="flex flex-col gap-3 rounded-[26px] bg-card p-3">
      {onExport && (
        <div className="flex justify-end px-2 pt-1">
          <Button variant="secondary" onClick={onExport}>
            <FileDown aria-hidden strokeWidth={1.75} className="size-4.5" />
            Exportar PDF
          </Button>
        </div>
      )}
      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rose-100 p-4 text-rose-700"
        >
          <span>{error}</span>
          {onRetry && (
            <Button variant="ghost" onClick={onRetry}>
              Reintentar
            </Button>
          )}
        </div>
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
            <tbody>
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
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-3.5 py-10 text-center text-muted-foreground"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className="animate-arrive transition-colors hover:bg-background/60 motion-reduce:animate-none"
                    style={{ animationDelay: `${Math.min(index, 7) * 60}ms` }}
                  >
                    {row.getAllCells().map((cell) => (
                      <td key={cell.id} className="relative border-b border-muted px-3.5 py-2.5">
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {(summary || footerNote) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 pb-1 text-[13px] text-muted-foreground">
          <span>{summary}</span>
          {footerNote}
        </div>
      )}
    </section>
  );
}
