import type { SystemTopRouteRow } from '@debus/contracts';
import { assertPrintable } from '../../common/pdf/printable-text';
import { toReportDocument } from './system-top-routes.pdf';
import type { TopRoutesTotals } from './system-top-routes.rows';

describe('the system top routes report document', () => {
  const rows: SystemTopRouteRow[] = [
    {
      position: 1,
      routeId: '3b2c1d0e-6f5a-4b4c-9d8e-7f6a5b4c3d2e',
      branchId: 'b1000000-4b5a-4968-8776-655443322110',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      distanceKm: 201.5,
      ticketPrice: 85,
      active: true,
      trips: 2,
      onlineTickets: 3,
      counterTickets: 9,
      tickets: 12,
      income: 1020,
      share: 75,
    },
    {
      position: 2,
      routeId: '4b2c1d0e-6f5a-4b4c-9d8e-7f6a5b4c3d2e',
      branchId: 'b1000000-4b5a-4968-8776-655443322110',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Antigua Guatemala',
      distanceKm: null,
      ticketPrice: null,
      active: null,
      trips: 1,
      onlineTickets: 4,
      counterTickets: 0,
      tickets: 4,
      income: 400,
      share: 25,
    },
  ];
  const totals: TopRoutesTotals = { routes: 2, trips: 3, tickets: 16, income: 1420 };
  const now = new Date('2026-10-13T21:20:00Z');
  const build = (
    query: { from?: string; to?: string; branchId?: string } = {},
    over: Partial<Parameters<typeof toReportDocument>[0]> = {},
  ) =>
    toReportDocument({
      query: { ...query, page: 1, pageSize: 20 },
      branchLabel: null,
      rows,
      totals,
      now,
      ...over,
    });

  it('titles the report for every branch and uses a landscape sheet', () => {
    const doc = build();

    expect(doc.title).toBe('Rutas más demandadas');
    expect(doc.scope).toBe('Todas las sucursales');
    expect(doc.landscape).toBe(true);
    expect(doc.generatedAt).toBe(now);
  });

  it('ranks the routes by tickets with their share and closes with the total', () => {
    const table = build().tables[0];

    expect(table?.columns.map((c) => c.header)).toEqual([
      '#',
      'Ruta',
      'Distancia',
      'Precio',
      'Viajes',
      'En línea',
      'Ventanilla',
      'Boletos',
      'Ingresos',
      'Participación',
    ]);
    expect(table?.rows).toEqual([
      {
        cells: [
          '1',
          'Quetzaltenango – Guatemala',
          '202 km',
          'Q 85.00',
          '2',
          '3',
          '9',
          '12',
          'Q 1,020.00',
          '75.0 %',
        ],
      },
      {
        cells: [
          '2',
          'Quetzaltenango – Antigua Guatemala',
          '—',
          '—',
          '1',
          '4',
          '0',
          '4',
          'Q 400.00',
          '25.0 %',
        ],
      },
      { cells: ['', 'Total', '', '', '3', '', '', '16', 'Q 1,420.00', '100.0 %'], tone: 'total' },
    ]);
  });

  it('shows the highlights of the filtered set', () => {
    expect(build().highlights).toEqual([
      { label: 'Rutas', value: '2' },
      { label: 'Viajes', value: '3' },
      { label: 'Boletos', value: '16' },
      { label: 'Ingresos', value: 'Q 1,420.00' },
    ]);
  });

  it('says every record when there is no range and prints the range and branch that were chosen', () => {
    expect(build().period).toBe('Todos los registros');
    expect(build().filters).toEqual([]);

    const doc = build(
      { from: '2026-10-01', to: '2026-10-13', branchId: rows[0]?.branchId },
      { branchLabel: 'Quetzaltenango' },
    );
    expect(doc.period).toBe('Del 1 oct. 2026 al 13 oct. 2026');
    expect(doc.filters).toEqual(['Sucursal de origen: Quetzaltenango']);
    expect(build({ branchId: rows[0]?.branchId }).filters).toEqual([
      'Sucursal de origen: Sucursal sin datos',
    ]);
  });

  it('explains what counts as demand', () => {
    expect(build().notes).toEqual([
      'Solo aparecen las rutas con al menos un boleto pagado en el periodo. No incluye boletos de viajes eliminados.',
    ]);
  });

  it('only carries text the standard PDF font can print', () => {
    expect(() => assertPrintable(build())).not.toThrow();
  });

  it('explains an empty result', () => {
    const doc = build({}, { rows: [], totals: { routes: 0, trips: 0, tickets: 0, income: 0 } });

    expect(doc.tables[0]?.rows).toEqual([]);
    expect(doc.tables[0]?.emptyMessage).toBe('No hay rutas con boletos vendidos con esos filtros.');
  });
});
