import type { BranchRepairExpenseRow, RepairCategoryShare } from '@debus/contracts';
import { assertPrintable } from '../../common/pdf/printable-text';
import { toReportDocument } from './branch-repair-expenses.pdf';
import type { RepairTotals } from './branch-repair-expenses.rows';

describe('the repair expenses report document', () => {
  const motor: RepairCategoryShare = {
    categoryId: 'a1000000-4b5a-4968-8776-655443322110',
    categoryName: 'Motor',
    lines: 2,
    amount: 1500,
  };
  const tires: RepairCategoryShare = {
    categoryId: 'a2000000-4b5a-4968-8776-655443322110',
    categoryName: 'Llantas',
    lines: 1,
    amount: 800,
  };
  const brakes: RepairCategoryShare = {
    categoryId: 'a3000000-4b5a-4968-8776-655443322110',
    categoryName: 'Frenos',
    lines: 1,
    amount: 450,
  };
  const rows: BranchRepairExpenseRow[] = [
    {
      busId: '1f0e2d3c-4b5a-4968-8776-655443322110',
      plate: 'C482BTX',
      brand: 'Volvo',
      model: 'B12M',
      expenses: 2,
      total: 2300,
      categories: [motor, tires],
    },
    {
      busId: '2f0e2d3c-4b5a-4968-8776-655443322110',
      plate: null,
      brand: null,
      model: null,
      expenses: 1,
      total: 450,
      categories: [brakes],
    },
  ];
  const totals: RepairTotals = { buses: 2, expenses: 3, total: 2750 };
  const groups = [motor, tires, brakes];
  const now = new Date('2026-10-13T21:20:00Z');
  const build = (
    query: { from?: string; to?: string; busId?: string; categoryId?: string } = {},
    over: Partial<Parameters<typeof toReportDocument>[0]> = {},
  ) =>
    toReportDocument({
      branchName: 'Quetzaltenango',
      query: { ...query, page: 1, pageSize: 20 },
      rows,
      totals,
      groups,
      busLabel: null,
      categoryName: null,
      now,
      ...over,
    });

  it('opens each bus with a group row, its categories and its total', () => {
    const table = build().tables[0];

    expect(table?.columns.map((c) => c.header)).toEqual([
      'Bus / Categoría',
      'Gastos',
      'Líneas',
      'Monto',
    ]);
    expect(table?.rows.slice(0, 4)).toEqual([
      { cells: ['C-482BTX · Volvo B12M', '', '', ''], tone: 'group' },
      { cells: ['Motor', '', '2', 'Q 1,500.00'] },
      { cells: ['Llantas', '', '1', 'Q 800.00'] },
      { cells: ['Total del bus', '2', '3', 'Q 2,300.00'], tone: 'subtotal' },
    ]);
  });

  it('names a bus the read model does not know', () => {
    const table = build().tables[0];

    expect(table?.rows[4]).toEqual({ cells: ['Bus sin datos', '', '', ''], tone: 'group' });
    expect(table?.rows[6]).toEqual({
      cells: ['Total del bus', '1', '1', 'Q 450.00'],
      tone: 'subtotal',
    });
  });

  it('adds a table with the total of each category and the grand total', () => {
    const table = build().tables[1];

    expect(table?.title).toBe('Totales por categoría');
    expect(table?.columns.map((c) => c.header)).toEqual(['Categoría', 'Líneas', 'Monto']);
    expect(table?.rows).toEqual([
      { cells: ['Motor', '2', 'Q 1,500.00'] },
      { cells: ['Llantas', '1', 'Q 800.00'] },
      { cells: ['Frenos', '1', 'Q 450.00'] },
      { cells: ['Gran total', '4', 'Q 2,750.00'], tone: 'total' },
    ]);
  });

  it('shows the highlights of the filtered set', () => {
    expect(build().highlights).toEqual([
      { label: 'Buses', value: '2' },
      { label: 'Gastos', value: '3' },
      { label: 'Total', value: 'Q 2,750.00' },
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
        { busId: '1f0e2d3c-4b5a-4968-8776-655443322110', categoryId: motor.categoryId },
        { busLabel: 'C-482BTX', categoryName: 'Motor' },
      ).filters,
    ).toEqual(['Bus: C-482BTX', 'Categoría: Motor']);
  });

  it('still names a filter whose bus or category is no longer known', () => {
    expect(
      build({ busId: '1f0e2d3c-4b5a-4968-8776-655443322110', categoryId: motor.categoryId })
        .filters,
    ).toEqual(['Bus: Bus sin datos', 'Categoría: Sin datos']);
  });

  it('titles the report and scopes it to the branch', () => {
    const doc = build();

    expect(doc.title).toBe('Gastos de taller por bus y categoría');
    expect(doc.scope).toBe('Sucursal Quetzaltenango');
    expect(doc.landscape).toBe(false);
    expect(doc.generatedAt).toBe(now);
  });

  it('explains an empty result and leaves out the table of categories', () => {
    const doc = toReportDocument({
      branchName: null,
      query: { page: 1, pageSize: 20 },
      rows: [],
      totals: { buses: 0, expenses: 0, total: 0 },
      groups: [],
      busLabel: null,
      categoryName: null,
      now,
    });

    expect(doc.scope).toBe('Sucursal');
    expect(doc.tables).toHaveLength(1);
    expect(doc.tables[0]?.rows).toEqual([]);
    expect(doc.tables[0]?.emptyMessage).toBe('No hay gastos de taller con esos filtros.');
  });

  it('only carries text the standard PDF font can print, filters included', () => {
    expect(() =>
      assertPrintable(
        build(
          {
            from: '2026-10-01',
            to: '2026-10-13',
            busId: rows[0]?.busId,
            categoryId: groups[0]?.categoryId,
          },
          { busLabel: 'C-482BTX', categoryName: 'Motor' },
        ),
      ),
    ).not.toThrow();
  });
});
