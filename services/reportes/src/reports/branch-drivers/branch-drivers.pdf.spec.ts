import type { BranchDriverRow } from '@debus/contracts';
import { assertPrintable } from '../../common/pdf/printable-text';
import { toReportDocument } from './branch-drivers.pdf';

describe('the drivers report document', () => {
  const rows: BranchDriverRow[] = [
    {
      driverId: '1f0e2d3c-4b5a-4968-8776-655443322110',
      licenseNumber: 'A1234567',
      fullName: 'Ana Pérez',
      licenseType: 'B',
      licenseExpiresOn: '2027-03-01',
      active: true,
      completedTrips: 7,
    },
    {
      driverId: '2f0e2d3c-4b5a-4968-8776-655443322110',
      licenseNumber: 'A7654321',
      fullName: 'José Núñez',
      licenseType: 'A',
      licenseExpiresOn: '2026-11-05',
      active: false,
      completedTrips: 1,
    },
  ];
  const now = new Date('2026-10-13T21:20:00Z');
  const build = (query: { status: 'all' | 'active' | 'inactive'; q?: string }) =>
    toReportDocument({
      branchName: 'Quetzaltenango',
      query: { ...query, page: 1, pageSize: 20 },
      rows,
      totals: { drivers: 2, completedTrips: 8 },
      now,
    });

  it('lists every driver with the status in Spanish and the totals at the end', () => {
    const doc = build({ status: 'active' });

    expect(doc.title).toBe('Listado general de choferes');
    expect(doc.scope).toBe('Sucursal Quetzaltenango');
    expect(doc.filters).toEqual(['Estado: Activos']);
    expect(doc.tables[0]?.columns.map((c) => c.header)).toEqual([
      'Licencia',
      'Nombre completo',
      'Tipo',
      'Vence',
      'Estado',
      'Viajes realizados',
    ]);
    expect(doc.tables[0]?.rows[0]?.cells).toEqual([
      'A1234567',
      'Ana Pérez',
      'B',
      '1 mar. 2027',
      'Activo',
      '7',
    ]);
    expect(doc.tables[0]?.rows[1]?.cells[4]).toBe('Inactivo');
    expect(doc.tables[0]?.rows.at(-1)).toMatchObject({ tone: 'total' });
    expect(doc.tables[0]?.rows.at(-1)?.cells).toEqual(['Total', '', '', '', '', '8']);
    expect(doc.period).toBeNull();
    expect(doc.generatedAt).toBe(now);
  });

  it('names the inactive filter and the search', () => {
    expect(build({ status: 'inactive' }).filters).toEqual(['Estado: Inactivos']);
    expect(build({ status: 'all', q: 'nunez' }).filters).toEqual(['Búsqueda: nunez']);
  });

  it('shows the highlights and no filters when nothing narrows the list', () => {
    const doc = build({ status: 'all' });

    expect(doc.filters).toEqual([]);
    expect(doc.highlights).toEqual([
      { label: 'Choferes', value: '2' },
      { label: 'Viajes realizados', value: '8' },
    ]);
  });

  it('explains an empty list and leaves out the total row', () => {
    const doc = toReportDocument({
      branchName: null,
      query: { status: 'all', page: 1, pageSize: 20 },
      rows: [],
      totals: { drivers: 0, completedTrips: 0 },
      now,
    });

    expect(doc.scope).toBe('Sucursal');
    expect(doc.tables[0]?.rows).toEqual([]);
    expect(doc.tables[0]?.emptyMessage).toBe('No hay choferes con esos filtros.');
  });

  it('only carries text the standard PDF font can print, filters included', () => {
    expect(() => assertPrintable(build({ status: 'inactive', q: 'perez' }))).not.toThrow();
  });
});
