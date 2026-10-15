import type { BranchDepreciationRow } from '@debus/contracts';
import { assertPrintable } from '../../common/pdf/printable-text';
import { toReportDocument } from './branch-depreciation.pdf';
import type { DepreciationTotals } from './branch-depreciation.rows';

describe('the depreciation report document', () => {
  const rows: BranchDepreciationRow[] = [
    {
      busId: '1f0e2d3c-4b5a-4968-8776-655443322110',
      plate: 'C482BTX',
      brand: 'Volvo',
      model: 'B8R',
      completedTrips: 2,
      kmTraveled: 300,
      appliedPerKm: 1.33,
      accumulated: 400,
    },
    {
      busId: '2f0e2d3c-4b5a-4968-8776-655443322110',
      plate: 'C500BTX',
      brand: 'Hino',
      model: 'RK8',
      completedTrips: 0,
      kmTraveled: 0,
      appliedPerKm: null,
      accumulated: 0,
    },
  ];
  const now = new Date('2026-10-13T21:20:00Z');
  const build = (
    query: { from?: string; to?: string; q?: string } = {},
    totals: DepreciationTotals = { kmTraveled: 300, accumulated: 400, currentPerKm: 1.5 },
  ) =>
    toReportDocument({
      branchName: 'Quetzaltenango',
      query: { ...query, page: 1, pageSize: 20 },
      rows,
      totals,
      now,
    });

  it('lists every bus with what was applied per km and the total at the end', () => {
    const doc = build();

    expect(doc.title).toBe('Depreciación por bus');
    expect(doc.scope).toBe('Sucursal Quetzaltenango');
    expect(doc.tables[0]?.columns.map((c) => c.header)).toEqual([
      'Placa',
      'Bus',
      'Viajes',
      'Km recorridos',
      'Monto por km aplicado',
      'Depreciación acumulada',
    ]);
    expect(doc.tables[0]?.rows[0]?.cells).toEqual([
      'C-482BTX',
      'Volvo B8R',
      '2',
      '300 km',
      'Q 1.33',
      'Q 400.00',
    ]);
    expect(doc.tables[0]?.rows[1]?.cells[4]).toBe('—');
    expect(doc.tables[0]?.rows.at(-1)).toMatchObject({ tone: 'total' });
    expect(doc.tables[0]?.rows.at(-1)?.cells).toEqual(['Total', '', '', '300 km', '', 'Q 400.00']);
    expect(doc.generatedAt).toBe(now);
  });

  it('shows the highlights with the rate in force today', () => {
    expect(build().highlights).toEqual([
      { label: 'Km recorridos', value: '300 km' },
      { label: 'Depreciación acumulada', value: 'Q 400.00' },
      { label: 'Monto por km vigente hoy', value: 'Q 1.50' },
    ]);
  });

  it('says so when no rate is configured', () => {
    const doc = build({}, { kmTraveled: 0, accumulated: 0, currentPerKm: null });

    expect(doc.highlights.at(-1)).toEqual({
      label: 'Monto por km vigente hoy',
      value: 'Sin configurar',
    });
  });

  it('names the period and the search', () => {
    expect(build().period).toBe('Todos los registros');
    expect(build({ from: '2026-10-01', to: '2026-10-13' }).period).toBe(
      'Del 1 oct. 2026 al 13 oct. 2026',
    );
    expect(build({ from: '2026-10-01' }).period).toBe('Desde el 1 oct. 2026');
    expect(build({ q: 'volvo' }).filters).toEqual(['Búsqueda: volvo']);
    expect(build().filters).toEqual([]);
  });

  it('explains how the depreciation of each trip is fixed', () => {
    expect(build().notes).toEqual([
      'La depreciación de cada viaje se fija con el monto vigente el día de su llegada; cambiar el monto no altera viajes anteriores.',
    ]);
  });

  it('explains an empty list and leaves out the total row', () => {
    const doc = toReportDocument({
      branchName: null,
      query: { page: 1, pageSize: 20 },
      rows: [],
      totals: { kmTraveled: 0, accumulated: 0, currentPerKm: null },
      now,
    });

    expect(doc.scope).toBe('Sucursal');
    expect(doc.tables[0]?.rows).toEqual([]);
    expect(doc.tables[0]?.emptyMessage).toBe('No hay buses con esos filtros.');
  });

  it('only carries text the standard PDF font can print, filters included', () => {
    expect(() =>
      assertPrintable(build({ from: '2026-10-01', to: '2026-10-13', q: 'volvo' })),
    ).not.toThrow();
  });
});
