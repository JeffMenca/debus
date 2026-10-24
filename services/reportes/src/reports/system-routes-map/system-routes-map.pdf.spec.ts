import type { SystemRoutesMap } from '@debus/contracts';
import { assertPrintable } from '../../common/pdf/printable-text';
import { toReportDocument } from './system-routes-map.pdf';

describe('the system routes map report document', () => {
  const origin = {
    id: '9b2c7a10-1111-4c4c-8888-123456789abc',
    name: 'Quetzaltenango',
    latitude: 14.8347,
    longitude: -91.5181,
    routes: 2,
  };
  const map: SystemRoutesMap = {
    branches: [origin],
    selectedBranchId: origin.id,
    routes: [
      {
        routeId: '3b2c1d0e-6f5a-4b4c-9d8e-7f6a5b4c3d2e',
        destinationBranchId: '5d1f3a20-2222-4d4d-9999-123456789abc',
        destinationName: 'Guatemala',
        latitude: 14.6349,
        longitude: -90.5069,
        distanceKm: 201.5,
        ticketPrice: 85,
        tickets: 12,
      },
      {
        routeId: '4b2c1d0e-6f5a-4b4c-9d8e-7f6a5b4c3d2e',
        destinationBranchId: '6d1f3a20-2222-4d4d-9999-123456789abc',
        destinationName: 'Panajachel',
        latitude: 14.74,
        longitude: -91.16,
        distanceKm: 92,
        ticketPrice: 40,
        tickets: 0,
      },
    ],
  };
  const now = new Date('2026-10-13T21:20:00Z');

  it('titles the report after the origin branch with no period', () => {
    const doc = toReportDocument({ map, now });

    expect(doc.title).toBe('Mapa de rutas');
    expect(doc.scope).toBe('Sucursal de origen: Quetzaltenango');
    expect(doc.period).toBeNull();
    expect(doc.filters).toEqual([]);
    expect(doc.landscape).toBe(false);
    expect(doc.generatedAt).toBe(now);
  });

  it('lists each active route with its distance, price and tickets sold, and the total', () => {
    const table = toReportDocument({ map, now }).tables[0];

    expect(table?.columns.map((c) => c.header)).toEqual([
      'Destino',
      'Distancia',
      'Precio',
      'Boletos vendidos',
    ]);
    expect(table?.rows).toEqual([
      { cells: ['Guatemala', '202 km', 'Q 85.00', '12'] },
      { cells: ['Panajachel', '92 km', 'Q 40.00', '0'] },
      { cells: ['Total', '', '', '12'], tone: 'total' },
    ]);
  });

  it('shows the highlights of the branch', () => {
    expect(toReportDocument({ map, now }).highlights).toEqual([
      { label: 'Rutas activas', value: '2' },
      { label: 'Boletos vendidos', value: '12' },
    ]);
  });

  it('only carries text the standard PDF font can print', () => {
    expect(() => assertPrintable(toReportDocument({ map, now }))).not.toThrow();
  });

  it('explains a branch without active routes', () => {
    const doc = toReportDocument({ map: { ...map, routes: [] }, now });

    expect(doc.tables[0]?.rows).toEqual([]);
    expect(doc.tables[0]?.emptyMessage).toBe('Esta sucursal aún no tiene rutas activas.');
  });

  it('explains that no branch has routes yet', () => {
    const doc = toReportDocument({
      map: { branches: [], selectedBranchId: null, routes: [] },
      now,
    });

    expect(doc.scope).toBe('Todas las sucursales');
    expect(doc.tables[0]?.emptyMessage).toBe('Todavía no hay rutas activas.');
  });

  it('names a branch that was asked for but has no copy', () => {
    const doc = toReportDocument({
      map: { branches: [], selectedBranchId: origin.id, routes: [] },
      now,
    });

    expect(doc.scope).toBe('Sucursal de origen: Sucursal sin datos');
  });
});
