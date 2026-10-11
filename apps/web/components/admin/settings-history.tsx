'use client';

import { type SettingsVersion, todayInGuatemala } from '@debus/contracts';
import { useMemo } from 'react';
import { StatusDot, type StatusTone } from '@/components/brand/status-dot';
import { DataTable, columnHelperFor } from '@/components/data/data-table';
import { type VersionStatus, versionStatus } from '@/lib/admin/settings-status';
import { formatDateTime, formatLongDate, formatQuetzales } from '@/lib/format';

const STATUS_VIEW: Record<VersionStatus, { tone: StatusTone; label: string }> = {
  current: { tone: 'mint', label: 'Vigente' },
  scheduled: { tone: 'sky', label: 'Programado' },
  past: { tone: 'muted', label: 'Anterior' },
};

const helper = columnHelperFor<SettingsVersion>();
const amount = (value: number) => (
  <div className="text-right font-mono tabular-nums">{formatQuetzales(value)}</div>
);

interface SettingsHistoryProps {
  versions: SettingsVersion[];
  current: SettingsVersion | null;
}

export function SettingsHistory({ versions, current }: SettingsHistoryProps) {
  const columns = useMemo(() => {
    const today = todayInGuatemala();
    return helper.columns([
      helper.accessor('effectiveFrom', {
        header: 'Vigente desde',
        cell: (info) => formatLongDate(info.getValue()),
      }),
      helper.accessor('depreciationPerKm', {
        header: () => <div className="text-right">Depreciación por km</div>,
        cell: (info) => amount(info.getValue()),
      }),
      helper.accessor('rentalRatePerKm', {
        header: () => <div className="text-right">Tarifa por km</div>,
        cell: (info) => amount(info.getValue()),
      }),
      helper.accessor('createdByName', {
        header: 'Registrado por',
        cell: (info) => info.getValue() ?? <span className="text-muted-foreground">—</span>,
      }),
      helper.accessor('createdAt', {
        header: 'Registrado el',
        cell: (info) => formatDateTime(info.getValue()),
      }),
      helper.display({
        id: 'status',
        header: 'Estado',
        cell: ({ row }) => {
          const view = STATUS_VIEW[versionStatus(row.original, current, today)];
          return <StatusDot tone={view.tone} label={view.label} />;
        },
      }),
    ]);
  }, [current]);

  return (
    <DataTable
      caption="Historial de configuración"
      columns={columns}
      data={versions}
      getRowId={(version) => version.id}
      emptyMessage="Todavía no hay cambios registrados."
      minWidth={860}
    />
  );
}
