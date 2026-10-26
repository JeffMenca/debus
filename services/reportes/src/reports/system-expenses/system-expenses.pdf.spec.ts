import type { SystemExpenseRow } from '@debus/contracts';
import { assertPrintable } from '../../common/pdf/printable-text';
import { toReportDocument } from './system-expenses.pdf';
import type { ExpenseGroup, ExpenseTotals } from './system-expenses.rows';

describe('the system expenses report document', () => {
  const angeles = { branchId: 'b1000000-4b5a-4968-8776-655443322110', branchName: 'Ángeles' };
  const boca = { branchId: 'b2000000-4b5a-4968-8776-655443322110', branchName: 'Boca' };
  const base = { busPlate: 'C482BTX', categoryName: null, description: null };
  const rows: SystemExpenseRow[] = [
    {
      id: 'a:FUEL',
      ...angeles,
      ...base,
      concept: 'FUEL',
      day: '2026-10-20',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      amount: 1250,
    },
    {
      id: 'a:DEPRECIATION',
      ...angeles,
      ...base,
      concept: 'DEPRECIATION',
      day: '2026-10-20',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      amount: 303,
    },
    {
      id: 'b:0',
      ...boca,
      ...base,
      busPlate: null,
      concept: 'PART',
      day: '2026-10-15',
      originLabel: null,
      destinationLabel: null,
      categoryName: 'Llantas',
      description: 'Dos llantas',
      amount: 2400,
    },
  ];
  const totals: ExpenseTotals = {
    entries: 3,
    amount: 3953,
    fuel: 1250,
    depreciation: 303,
    labor: 0,
    parts: 2400,
  };
  const groups: ExpenseGroup[] = [
    { ...angeles, entries: 2, amount: 1553 },
    { ...boca, entries: 1, amount: 2400 },
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

    expect(doc.title).toBe('Gastos por sucursal');
    expect(doc.scope).toBe('Todas las sucursales');
    expect(doc.landscape).toBe(true);
  });

  it('groups the expenses by branch with a subtotal each and the grand total at the end', () => {
    const table = build().tables[0];

    expect(table?.columns.map((c) => c.header)).toEqual([
      'Fecha',
      'Concepto',
      'Bus',
      'Detalle',
      'Monto',
    ]);
    expect(table?.rows).toEqual([
      { cells: ['Ángeles', '', '', '', ''], tone: 'group' },
      {
        cells: [
          '20 oct. 2026',
          'Combustible',
          'C-482BTX',
          'Quetzaltenango – Guatemala',
          'Q 1,250.00',
        ],
      },
      {
        cells: [
          '20 oct. 2026',
          'Depreciación',
          'C-482BTX',
          'Quetzaltenango – Guatemala',
          'Q 303.00',
        ],
      },
      { cells: ['Subtotal Ángeles', '', '', '', 'Q 1,553.00'], tone: 'subtotal' },
      { cells: ['Boca', '', '', '', ''], tone: 'group' },
      {
        cells: ['15 oct. 2026', 'Repuestos', 'Bus sin datos', 'Llantas: Dos llantas', 'Q 2,400.00'],
      },
      { cells: ['Subtotal Boca', '', '', '', 'Q 2,400.00'], tone: 'subtotal' },
      { cells: ['Total global', '', '', '', 'Q 3,953.00'], tone: 'total' },
    ]);
  });

  it('shows the highlights of the filtered set', () => {
    expect(build().highlights).toEqual([
      { label: 'Registros', value: '3' },
      { label: 'Combustible', value: 'Q 1,250.00' },
      { label: 'Depreciación', value: 'Q 303.00' },
      { label: 'Mano de obra', value: 'Q 0.00' },
      { label: 'Repuestos', value: 'Q 2,400.00' },
      { label: 'Total de gastos', value: 'Q 3,953.00' },
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
    expect(build({ branchId: angeles.branchId }).filters).toEqual(['Sucursal: Sucursal sin datos']);
  });

  it('says that the pay of the drivers is not an expense of the report', () => {
    expect(build().notes).toEqual([
      'Incluye combustible, depreciación, mano de obra y repuestos. No incluye el salario de los choferes.',
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
      totals: { entries: 0, amount: 0, fuel: 0, depreciation: 0, labor: 0, parts: 0 },
      groups: [],
      now,
    });

    expect(doc.tables[0]?.rows).toEqual([]);
    expect(doc.tables[0]?.emptyMessage).toBe('No hay gastos con esos filtros.');
  });
});
