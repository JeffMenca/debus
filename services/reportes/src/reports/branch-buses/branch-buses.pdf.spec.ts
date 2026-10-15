import type { BranchBusRow } from '@debus/contracts';
import { assertPrintable } from '../../common/pdf/printable-text';
import { toReportDocument } from './branch-buses.pdf';

describe('the buses report document', () => {
  const rows: BranchBusRow[] = [
    {
      busId: '1f0e2d3c-4b5a-4968-8776-655443322110',
      plate: 'C482BTX',
      brand: 'Volvo',
      model: 'B8R',
      capacity: 40,
      status: 'IN_WORKSHOP',
      driverName: null,
      mileageKm: 148412,
      completedTrips: 7,
    },
    {
      busId: '2f0e2d3c-4b5a-4968-8776-655443322110',
      plate: 'C500BTX',
      brand: 'Hino',
      model: 'RK8',
      capacity: 36,
      status: 'IN_TRANSIT',
      driverName: 'Ana Pérez',
      mileageKm: 900,
      completedTrips: 1,
    },
  ];
  const now = new Date('2026-10-13T21:20:00Z');
  const build = (query: { status: 'all' | 'IN_WORKSHOP'; q?: string }) =>
    toReportDocument({
      branchName: 'Quetzaltenango',
      query: { ...query, page: 1, pageSize: 20 },
      rows,
      totals: { buses: 2, completedTrips: 8 },
      now,
    });

  it('lists every bus with its status in Spanish and the totals at the end', () => {
    const doc = build({ status: 'IN_WORKSHOP' });

    expect(doc.title).toBe('Listado general de buses');
    expect(doc.scope).toBe('Sucursal Quetzaltenango');
    expect(doc.filters).toEqual(['Estado: En taller']);
    expect(doc.tables[0]?.columns.map((c) => c.header)).toEqual([
      'Placa',
      'Marca',
      'Modelo',
      'Capacidad',
      'Estado',
      'Chofer asignado',
      'Kilometraje',
      'Viajes realizados',
    ]);
    expect(doc.tables[0]?.rows[0]?.cells).toEqual([
      'C-482BTX',
      'Volvo',
      'B8R',
      '40',
      'En taller',
      'Sin chofer',
      '148,412 km',
      '7',
    ]);
    expect(doc.tables[0]?.rows[1]?.cells[4]).toBe('En ruta');
    expect(doc.tables[0]?.rows.at(-1)).toMatchObject({ tone: 'total' });
    expect(doc.tables[0]?.rows.at(-1)?.cells.at(-1)).toBe('8');
    expect(doc.period).toBeNull();
    expect(doc.generatedAt).toBe(now);
  });

  it('shows the highlights and no filters when nothing narrows the list', () => {
    const doc = build({ status: 'all' });

    expect(doc.filters).toEqual([]);
    expect(doc.highlights).toEqual([
      { label: 'Buses', value: '2' },
      { label: 'Viajes realizados', value: '8' },
    ]);
  });

  it('names the search among the filters', () => {
    expect(build({ status: 'all', q: 'volvo' }).filters).toEqual(['Búsqueda: volvo']);
  });

  it('explains an empty list and leaves out the total row', () => {
    const doc = toReportDocument({
      branchName: 'Quetzaltenango',
      query: { status: 'all', page: 1, pageSize: 20 },
      rows: [],
      totals: { buses: 0, completedTrips: 0 },
      now,
    });

    expect(doc.tables[0]?.rows).toEqual([]);
    expect(doc.tables[0]?.emptyMessage).toBe('No hay buses con esos filtros.');
  });

  it('falls back to a plain scope when the branch is unknown', () => {
    const doc = toReportDocument({
      branchName: null,
      query: { status: 'all', page: 1, pageSize: 20 },
      rows: [],
      totals: { buses: 0, completedTrips: 0 },
      now,
    });

    expect(doc.scope).toBe('Sucursal');
  });

  it('only carries text the standard PDF font can print, filters included', () => {
    expect(() => assertPrintable(build({ status: 'IN_WORKSHOP', q: 'hino' }))).not.toThrow();
  });
});
