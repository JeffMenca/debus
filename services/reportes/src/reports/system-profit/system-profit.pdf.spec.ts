import type { SystemProfitRow } from '@debus/contracts';
import { assertPrintable } from '../../common/pdf/printable-text';
import { toReportDocument } from './system-profit.pdf';
import type { ProfitTotals } from './system-profit.rows';

describe('the system profit report document', () => {
  const rows: SystemProfitRow[] = [
    {
      branchId: 'b1000000-4b5a-4968-8776-655443322110',
      branchName: 'Ángeles',
      ticketIncome: 255,
      rentalIncome: 2760,
      income: 3015,
      fuel: 1180,
      labor: 350.5,
      parts: 5200,
      depreciation: 456,
      expenses: 7186.5,
      profit: -4171.5,
      margin: -138.4,
    },
    {
      branchId: 'b2000000-4b5a-4968-8776-655443322110',
      branchName: 'Boca',
      ticketIncome: 850,
      rentalIncome: 0,
      income: 850,
      fuel: 400,
      labor: 0,
      parts: 300,
      depreciation: 100,
      expenses: 800,
      profit: 50,
      margin: 5.9,
    },
    {
      branchId: 'b3000000-4b5a-4968-8776-655443322110',
      branchName: 'Cumbre',
      ticketIncome: 0,
      rentalIncome: 0,
      income: 0,
      fuel: 0,
      labor: 0,
      parts: 0,
      depreciation: 0,
      expenses: 0,
      profit: 0,
      margin: null,
    },
  ];
  const totals: ProfitTotals = {
    ticketIncome: 1105,
    rentalIncome: 2760,
    income: 3865,
    fuel: 1580,
    labor: 350.5,
    parts: 5500,
    depreciation: 556,
    expenses: 7986.5,
    profit: -4121.5,
    margin: -106.6,
  };
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

    expect(doc.title).toBe('Ganancias por sucursal');
    expect(doc.scope).toBe('Todas las sucursales');
    expect(doc.landscape).toBe(true);
    expect(doc.generatedAt).toBe(now);
  });

  it('lists a row per branch with its income, expenses, profit and margin, and the total at the end', () => {
    const table = build().tables[0];

    expect(table?.columns.map((c) => c.header)).toEqual([
      'Sucursal',
      'Boletos',
      'Alquileres',
      'Ingresos',
      'Combustible',
      'Mano de obra',
      'Repuestos',
      'Depreciación',
      'Gastos',
      'Ganancia neta',
      'Margen',
    ]);
    expect(table?.rows[0]).toEqual({
      cells: [
        'Ángeles',
        'Q 255.00',
        'Q 2,760.00',
        'Q 3,015.00',
        'Q 1,180.00',
        'Q 350.50',
        'Q 5,200.00',
        'Q 456.00',
        'Q 7,186.50',
        '-Q 4,171.50',
        '-138.4 %',
      ],
    });
    expect(table?.rows[2]?.cells.at(-1)).toBe('—');
    expect(table?.rows[3]).toEqual({
      cells: [
        'Total',
        'Q 1,105.00',
        'Q 2,760.00',
        'Q 3,865.00',
        'Q 1,580.00',
        'Q 350.50',
        'Q 5,500.00',
        'Q 556.00',
        'Q 7,986.50',
        '-Q 4,121.50',
        '-106.6 %',
      ],
      tone: 'total',
    });
  });

  it('shows the highlights of the filtered set', () => {
    expect(build().highlights).toEqual([
      { label: 'Ingresos', value: 'Q 3,865.00' },
      { label: 'Gastos', value: 'Q 7,986.50' },
      { label: 'Ganancia neta', value: '-Q 4,121.50' },
      { label: 'Margen', value: '-106.6 %' },
    ]);
  });

  it('says every record when there is no range and prints the range and branch that were chosen', () => {
    expect(build().period).toBe('Todos los registros');
    expect(build().filters).toEqual([]);

    const doc = build(
      { from: '2026-10-01', branchId: rows[0]?.branchId },
      { branchLabel: 'Ángeles' },
    );
    expect(doc.period).toBe('Desde el 1 oct. 2026');
    expect(doc.filters).toEqual(['Sucursal: Ángeles']);
    expect(build({ branchId: rows[0]?.branchId }).filters).toEqual([
      'Sucursal: Sucursal sin datos',
    ]);
  });

  it('explains the date of each concept and that the pay of the drivers is left out', () => {
    expect(build().notes).toEqual([
      'Los ingresos se fechan por el día de pago, el taller por la fecha del servicio y el combustible y la depreciación por el día de llegada del viaje.',
      'No incluye el salario de los choferes.',
    ]);
  });

  it('only carries text the standard PDF font can print', () => {
    expect(() => assertPrintable(build())).not.toThrow();
  });

  it('explains an empty result', () => {
    const doc = build({}, { rows: [] });

    expect(doc.tables[0]?.rows).toEqual([]);
    expect(doc.tables[0]?.emptyMessage).toBe('No hay sucursales con esos filtros.');
  });
});
