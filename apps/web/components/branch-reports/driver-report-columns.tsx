'use client';

import type { BranchDriverRow } from '@debus/contracts';
import { StatusDot } from '@/components/brand/status-dot';
import { columnHelperFor } from '@/components/data/data-table';
import { LicenseBadge } from '@/components/fleet/license-badge';

const helper = columnHelperFor<BranchDriverRow>();

export const driverReportColumns = helper.columns([
  helper.accessor('licenseNumber', {
    header: 'Licencia',
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  helper.accessor('fullName', {
    header: 'Nombre completo',
    cell: (info) => <span className="font-bold">{info.getValue()}</span>,
  }),
  helper.accessor('licenseType', { header: 'Tipo' }),
  helper.accessor('licenseExpiresOn', {
    header: 'Vence',
    cell: (info) => <LicenseBadge expiresOn={info.getValue()} />,
  }),
  helper.accessor('active', {
    header: 'Estado',
    cell: (info) => (
      <StatusDot
        tone={info.getValue() ? 'mint' : 'muted'}
        label={info.getValue() ? 'Activo' : 'Inactivo'}
      />
    ),
  }),
  helper.accessor('completedTrips', {
    header: () => <span className="block text-right">Viajes realizados</span>,
    cell: (info) => (
      <span className="block text-right font-mono tabular-nums">{info.getValue()}</span>
    ),
  }),
]);
