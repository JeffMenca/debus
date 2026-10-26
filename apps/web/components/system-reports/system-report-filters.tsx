'use client';

import type { ReactNode } from 'react';
import { OptionSelect } from '@/components/forms/option-select';
import { ReportFilters } from '@/components/reports/report-filters';
import { ReportRangeField } from '@/components/reports/report-range-field';
import { useBranchOptions } from '@/hooks/use-branches';
import type { SystemReportView } from '@/lib/system-reports/system-report-params';

const noSearch = () => undefined;

interface SystemReportFiltersProps<Q extends SystemReportView> {
  query: Q;
  update: (patch: Partial<Q>) => void;
  // Filters of one report, such as the bus, after the branch.
  children?: ReactNode;
  // What clearing the filters resets besides the period and the branch.
  extraClear?: Partial<Q>;
  narrowed?: boolean;
  // The branch means something else in some reports, such as the one a route starts from.
  branchLabel?: string;
}

// The period and the branch every report of the system administrator has. Branches are few (the
// server sends up to 100), so the select needs no search of its own.
export function SystemReportFilters<Q extends SystemReportView>({
  query,
  update,
  children,
  extraClear,
  narrowed = false,
  branchLabel = 'Sucursal',
}: SystemReportFiltersProps<Q>) {
  const branches = useBranchOptions({ status: 'all' }).data ?? [];
  return (
    <ReportFilters
      narrowed={Boolean(query.from || query.to || query.branchId) || narrowed}
      onClear={() =>
        update({ from: undefined, to: undefined, branchId: undefined, ...extraClear } as Partial<Q>)
      }
    >
      <ReportRangeField
        range={{ from: query.from, to: query.to }}
        onChange={({ from, to }) => update({ from, to } as Partial<Q>)}
      />
      <OptionSelect
        id="system-report-branch"
        label={branchLabel}
        placeholder="Todas las sucursales"
        noneLabel="Todas las sucursales"
        options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
        total={branches.length}
        value={query.branchId ?? ''}
        onChange={(branchId) => update({ branchId: branchId || undefined } as Partial<Q>)}
        search=""
        onSearchChange={noSearch}
        searchLabel="Buscar sucursal"
        emptyMessage="No hay sucursales registradas."
      />
      {children}
    </ReportFilters>
  );
}
