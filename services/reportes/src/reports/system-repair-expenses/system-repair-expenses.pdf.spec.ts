import type { SystemRepairExpenseRow } from '@debus/contracts';
import { assertPrintable } from '../../common/pdf/printable-text';
import { toReportDocument } from './system-repair-expenses.pdf';
import type { RepairCategory, RepairTotals } from './system-repair-expenses.rows';

describe('the system repair expenses report document', () => {
  const llantas = { categoryId: 'c1000000-4b5a-4968-8776-655443322110', categoryName: 'Llantas' };
  const aceite = {
    categoryId: 'c2000000-4b5a-4968-8776-655443322110',
    categoryName: 'Cambio de aceite',
  };
  const base = {
    expenseId: '5d4e3f2a-8b7c-4d6e-9f0a-1b2c3d4e5f6a',
    busId: '1f0e2d3c-4b5a-4968-8776-655443322110',
    busPlate: 'C482BTX' as string | null,
    branchId: '9b2c7a10-1111-4c4c-8888-123456789abc',
    branchName: 'Quetzaltenango',
  };
  const rows: SystemRepairExpenseRow[] = [
    {
      ...base,
      ...llantas,
      lineNo: 0,
      serviceDate: '2026-10-15',
      kind: 'PART',
      description: 'Dos llantas delanteras',
      amount: 5200,
    },
    {
      ...base,
      ...aceite,
      busPlate: null,
      lineNo: 1,
      serviceDate: '2026-10-14',
      kind: 'LABOR',
      description: 'Cambio de aceite y filtro',
      amount: 350.5,
    },
  ];
  const totals: RepairTotals = { lines: 2, expenses: 1, amount: 5550.5 };
  const groups: RepairCategory[] = [
    { ...aceite, lines: 1, amount: 350.5 },
    { ...llantas, lines: 1, amount: 5200 },
  ];
  const now = new Date('2026-10-13T21:20:00Z');
  const build = (
    query: { from?: string; to?: string; branchId?: string; busId?: string } = {},
    over: Partial<Parameters<typeof toReportDocument>[0]> = {},
  ) =>
    toReportDocument({
      query: { ...query, page: 1, pageSize: 20 },
      branchLabel: null,
      busLabel: null,
      rows,
      totals,
      groups,
      now,
      ...over,
    });

  it('titles the report for every branch and uses a landscape sheet', () => {
    const doc = build();

    expect(doc.title).toBe('Gastos de taller por categoría');
    expect(doc.scope).toBe('Todas las sucursales');
    expect(doc.landscape).toBe(true);
    expect(doc.generatedAt).toBe(now);
  });

  it('groups the lines by category with a subtotal each and the grand total at the end', () => {
    const table = build().tables[0];

    expect(table?.columns.map((c) => c.header)).toEqual([
      'Fecha',
      'Sucursal',
      'Bus',
      'Tipo',
      'Descripción',
      'Monto',
    ]);
    expect(table?.rows).toEqual([
      { cells: ['Cambio de aceite', '', '', '', '', ''], tone: 'group' },
      {
        cells: [
          '14 oct. 2026',
          'Quetzaltenango',
          'Bus sin datos',
          'Mano de obra',
          'Cambio de aceite y filtro',
          'Q 350.50',
        ],
      },
      { cells: ['Subtotal Cambio de aceite', '', '', '', '', 'Q 350.50'], tone: 'subtotal' },
      { cells: ['Llantas', '', '', '', '', ''], tone: 'group' },
      {
        cells: [
          '15 oct. 2026',
          'Quetzaltenango',
          'C-482BTX',
          'Repuestos',
          'Dos llantas delanteras',
          'Q 5,200.00',
        ],
      },
      { cells: ['Subtotal Llantas', '', '', '', '', 'Q 5,200.00'], tone: 'subtotal' },
      { cells: ['Gran total', '', '', '', '', 'Q 5,550.50'], tone: 'total' },
    ]);
  });

  it('shows the highlights of the filtered set', () => {
    expect(build().highlights).toEqual([
      { label: 'Líneas', value: '2' },
      { label: 'Gastos', value: '1' },
      { label: 'Total de taller', value: 'Q 5,550.50' },
    ]);
  });

  it('says every record when there is no range and prints the range, branch and bus that were chosen', () => {
    expect(build().period).toBe('Todos los registros');
    expect(build().filters).toEqual([]);

    const doc = build(
      { from: '2026-10-01', to: '2026-10-13', branchId: base.branchId, busId: base.busId },
      { branchLabel: 'Quetzaltenango', busLabel: 'C-482BTX' },
    );
    expect(doc.period).toBe('Del 1 oct. 2026 al 13 oct. 2026');
    expect(doc.filters).toEqual(['Sucursal: Quetzaltenango', 'Bus: C-482BTX']);
  });

  it('still names a branch or bus that is no longer known', () => {
    expect(build({ branchId: base.branchId, busId: base.busId }).filters).toEqual([
      'Sucursal: Sucursal sin datos',
      'Bus: Bus sin datos',
    ]);
  });

  it('only carries text the standard PDF font can print', () => {
    expect(() => assertPrintable(build())).not.toThrow();
  });

  it('explains an empty result', () => {
    const doc = build({}, { rows: [], groups: [], totals: { lines: 0, expenses: 0, amount: 0 } });

    expect(doc.tables[0]?.rows).toEqual([]);
    expect(doc.tables[0]?.emptyMessage).toBe('No hay gastos de taller con esos filtros.');
  });
});
