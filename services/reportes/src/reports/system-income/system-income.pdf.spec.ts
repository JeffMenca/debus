import type { SystemIncomeRow } from '@debus/contracts';
import { assertPrintable } from '../../common/pdf/printable-text';
import { toReportDocument } from './system-income.pdf';
import type { IncomeGroup, IncomeTotals } from './system-income.rows';

describe('the system income report document', () => {
  const angeles = { branchId: 'b1000000-4b5a-4968-8776-655443322110', branchName: 'Ángeles' };
  const boca = { branchId: 'b2000000-4b5a-4968-8776-655443322110', branchName: 'Boca' };
  const rows: SystemIncomeRow[] = [
    {
      id: '1f0e2d3c-4b5a-4968-8776-655443322110',
      ...angeles,
      concept: 'ONLINE_TICKET',
      day: '2026-10-22',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      clientName: null,
      quantity: 2,
      amount: 170,
    },
    {
      id: '2f0e2d3c-4b5a-4968-8776-655443322110',
      ...angeles,
      concept: 'COUNTER_TICKET',
      day: '2026-10-20',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      clientName: null,
      quantity: 1,
      amount: 85,
    },
    {
      id: '3f0e2d3c-4b5a-4968-8776-655443322110',
      ...boca,
      concept: 'RENTAL',
      day: '2026-10-21',
      originLabel: 'Escuintla',
      destinationLabel: 'Panajachel',
      clientName: 'Colegio San José',
      quantity: 35,
      amount: 2760,
    },
  ];
  const totals: IncomeTotals = {
    entries: 3,
    amount: 3015,
    onlineTickets: 170,
    counterTickets: 85,
    rentals: 2760,
  };
  const groups: IncomeGroup[] = [
    { ...angeles, entries: 2, amount: 255 },
    { ...boca, entries: 1, amount: 2760 },
  ];
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
      groups,
      now,
      ...over,
    });

  it('titles the report for every branch and uses a landscape sheet', () => {
    const doc = build();

    expect(doc.title).toBe('Ingresos por sucursal');
    expect(doc.scope).toBe('Todas las sucursales');
    expect(doc.landscape).toBe(true);
    expect(doc.generatedAt).toBe(now);
  });

  it('groups the sales by branch with a subtotal each and the grand total at the end', () => {
    const table = build().tables[0];

    expect(table?.columns.map((c) => c.header)).toEqual([
      'Fecha de pago',
      'Concepto',
      'Detalle',
      'Cantidad',
      'Monto',
    ]);
    expect(table?.rows).toEqual([
      { cells: ['Ángeles', '', '', '', ''], tone: 'group' },
      {
        cells: ['22 oct. 2026', 'Boleto en línea', 'Quetzaltenango – Guatemala', '2', 'Q 170.00'],
      },
      {
        cells: [
          '20 oct. 2026',
          'Boleto de ventanilla',
          'Quetzaltenango – Guatemala',
          '1',
          'Q 85.00',
        ],
      },
      { cells: ['Subtotal Ángeles', '', '', '', 'Q 255.00'], tone: 'subtotal' },
      { cells: ['Boca', '', '', '', ''], tone: 'group' },
      {
        cells: [
          '21 oct. 2026',
          'Alquiler',
          'Colegio San José · Escuintla – Panajachel',
          '35',
          'Q 2,760.00',
        ],
      },
      { cells: ['Subtotal Boca', '', '', '', 'Q 2,760.00'], tone: 'subtotal' },
      { cells: ['Total global', '', '', '', 'Q 3,015.00'], tone: 'total' },
    ]);
  });

  it('shows the highlights of the filtered set', () => {
    expect(build().highlights).toEqual([
      { label: 'Registros', value: '3' },
      { label: 'Boletos en línea', value: 'Q 170.00' },
      { label: 'Boletos de ventanilla', value: 'Q 85.00' },
      { label: 'Alquileres', value: 'Q 2,760.00' },
      { label: 'Total de ingresos', value: 'Q 3,015.00' },
    ]);
  });

  it('says every record when there is no range and prints the range and branch that were chosen', () => {
    expect(build().period).toBe('Todos los registros');
    expect(build().filters).toEqual([]);

    const doc = build(
      { from: '2026-10-01', to: '2026-10-13', branchId: angeles.branchId },
      { branchLabel: 'Ángeles' },
    );
    expect(doc.period).toBe('Del 1 oct. 2026 al 13 oct. 2026');
    expect(doc.filters).toEqual(['Sucursal: Ángeles']);
  });

  it('names a chosen branch the read model does not know', () => {
    expect(build({ branchId: angeles.branchId }).filters).toEqual(['Sucursal: Sucursal sin datos']);
  });

  it('says that refunded tickets and cancelled rentals are not income', () => {
    expect(build().notes).toEqual([
      'No incluye boletos de viajes eliminados ni alquileres cancelados: se reembolsan.',
    ]);
  });

  it('only carries text the standard PDF font can print', () => {
    expect(() => assertPrintable(build())).not.toThrow();
  });

  it('explains an empty result', () => {
    const doc = toReportDocument({
      query: { page: 1, pageSize: 20 },
      branchLabel: null,
      rows: [],
      totals: { entries: 0, amount: 0, onlineTickets: 0, counterTickets: 0, rentals: 0 },
      groups: [],
      now,
    });

    expect(doc.tables[0]?.rows).toEqual([]);
    expect(doc.tables[0]?.emptyMessage).toBe('No hay ingresos con esos filtros.');
  });
});
