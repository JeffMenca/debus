import type { BranchTicketIncomeRow } from '@debus/contracts';
import { assertPrintable } from '../../common/pdf/printable-text';
import { toReportDocument } from './branch-ticket-income.pdf';
import type { TicketIncomeGroup, TicketIncomeTotals } from './branch-ticket-income.rows';

describe('the ticket income report document', () => {
  const rows: BranchTicketIncomeRow[] = [
    {
      tripId: '1f0e2d3c-4b5a-4968-8776-655443322110',
      departureAt: '2026-10-22T15:00:00.000Z',
      routeId: 'a2000000-4b5a-4968-8776-655443322110',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Antigua Guatemala',
      busId: 'b2000000-4b5a-4968-8776-655443322110',
      busPlate: 'C482BTX',
      tickets: 3,
      onlineTickets: 3,
      counterTickets: 0,
      income: 300,
    },
    {
      tripId: '2f0e2d3c-4b5a-4968-8776-655443322110',
      departureAt: '2026-10-20T17:30:00.000Z',
      routeId: 'a1000000-4b5a-4968-8776-655443322110',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      busId: 'b1000000-4b5a-4968-8776-655443322110',
      busPlate: null,
      tickets: 3,
      onlineTickets: 2,
      counterTickets: 1,
      income: 255,
    },
  ];
  const totals: TicketIncomeTotals = { trips: 2, tickets: 6, income: 555 };
  const groups: TicketIncomeGroup[] = [
    {
      routeId: 'a2000000-4b5a-4968-8776-655443322110',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Antigua Guatemala',
      tickets: 3,
      income: 300,
    },
    {
      routeId: 'a1000000-4b5a-4968-8776-655443322110',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      tickets: 3,
      income: 255,
    },
  ];
  const now = new Date('2026-10-13T21:20:00Z');
  const build = (
    query: { from?: string; to?: string; routeId?: string; busId?: string } = {},
    over: Partial<Parameters<typeof toReportDocument>[0]> = {},
  ) =>
    toReportDocument({
      branchName: 'Quetzaltenango',
      query: { ...query, page: 1, pageSize: 20 },
      rows,
      totals,
      groups,
      routeLabel: null,
      busLabel: null,
      now,
      ...over,
    });

  it('lists each trip with its departure, route, bus and tickets by channel', () => {
    const table = build().tables[0];

    expect(table?.columns.map((c) => c.header)).toEqual([
      'Salida',
      'Ruta',
      'Bus',
      'Boletos',
      'En línea',
      'Ventanilla',
      'Ingreso',
    ]);
    expect(table?.rows[0]).toEqual({
      cells: [
        '22/10/2026 09:00',
        'Quetzaltenango – Antigua Guatemala',
        'C-482BTX',
        '3',
        '3',
        '0',
        'Q 300.00',
      ],
    });
  });

  it('names a bus the read model does not know and closes the table with the totals', () => {
    const table = build().tables[0];

    expect(table?.rows[1]?.cells[2]).toBe('Bus sin datos');
    expect(table?.rows[2]).toEqual({
      cells: ['Total', '', '', '6', '', '', 'Q 555.00'],
      tone: 'total',
    });
  });

  it('adds a summary by route with its subtotals and the grand total', () => {
    const table = build().tables[1];

    expect(table?.title).toBe('Resumen por ruta');
    expect(table?.columns.map((c) => c.header)).toEqual(['Ruta', 'Boletos', 'Ingreso']);
    expect(table?.rows).toEqual([
      { cells: ['Quetzaltenango – Antigua Guatemala', '3', 'Q 300.00'] },
      { cells: ['Quetzaltenango – Guatemala', '3', 'Q 255.00'] },
      { cells: ['Total general', '6', 'Q 555.00'], tone: 'total' },
    ]);
  });

  it('only carries text the standard PDF font can print, with the route and its filter', () => {
    const doc = build(
      { routeId: groups[1]?.routeId, busId: rows[0]?.busId },
      { routeLabel: 'Quetzaltenango – Guatemala', busLabel: 'C-482BTX' },
    );

    expect(() => assertPrintable(doc)).not.toThrow();
  });

  it('shows the highlights of the filtered set', () => {
    expect(build().highlights).toEqual([
      { label: 'Viajes', value: '2' },
      { label: 'Boletos', value: '6' },
      { label: 'Ingresos', value: 'Q 555.00' },
    ]);
  });

  it('names the period and the filters that were chosen', () => {
    expect(build().period).toBe('Todos los registros');
    expect(build({ from: '2026-10-01', to: '2026-10-13' }).period).toBe(
      'Del 1 oct. 2026 al 13 oct. 2026',
    );
    expect(build().filters).toEqual([]);
    expect(
      build(
        { routeId: groups[1]?.routeId, busId: rows[0]?.busId },
        { routeLabel: 'Quetzaltenango – Guatemala', busLabel: 'C-482BTX' },
      ).filters,
    ).toEqual(['Ruta: Quetzaltenango – Guatemala', 'Bus: C-482BTX']);
  });

  it('still names a filter whose route or bus is no longer known', () => {
    expect(build({ routeId: groups[1]?.routeId, busId: rows[0]?.busId }).filters).toEqual([
      'Ruta: Ruta sin datos',
      'Bus: Bus sin datos',
    ]);
  });

  it('says that the trips that were deleted are not income', () => {
    expect(build().notes).toEqual(['No incluye boletos de viajes eliminados: se reembolsan.']);
  });

  it('titles the report, scopes it to the branch and uses a landscape sheet', () => {
    const doc = build();

    expect(doc.title).toBe('Ingresos por venta de boletos');
    expect(doc.scope).toBe('Sucursal Quetzaltenango');
    expect(doc.landscape).toBe(true);
    expect(doc.generatedAt).toBe(now);
  });

  it('explains an empty result and leaves out the summary', () => {
    const doc = toReportDocument({
      branchName: null,
      query: { page: 1, pageSize: 20 },
      rows: [],
      totals: { trips: 0, tickets: 0, income: 0 },
      groups: [],
      routeLabel: null,
      busLabel: null,
      now,
    });

    expect(doc.scope).toBe('Sucursal');
    expect(doc.tables).toHaveLength(1);
    expect(doc.tables[0]?.rows).toEqual([]);
    expect(doc.tables[0]?.emptyMessage).toBe('No hay ingresos por boletos con esos filtros.');
  });
});
