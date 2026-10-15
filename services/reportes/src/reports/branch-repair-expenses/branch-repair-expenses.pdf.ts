import {
  type BranchRepairExpenseRow,
  type BranchRepairExpensesQuery,
  type RepairCategoryShare,
  formatPlate,
} from '@debus/contracts';
import type { PdfColumn, PdfRow, PdfTable, ReportDocument } from '../../common/pdf/report-document';
import { formatMoney, reportPeriod } from '../../common/report-format';
import type { RepairTotals } from './branch-repair-expenses.rows';

export const UNKNOWN_BUS = 'Bus sin datos';

const BUS_COLUMNS: PdfColumn[] = [
  { header: 'Bus / Categoría', width: '*' },
  { header: 'Gastos', width: 'auto', align: 'right' },
  { header: 'Líneas', width: 'auto', align: 'right' },
  { header: 'Monto', width: 'auto', align: 'right' },
];
const CATEGORY_COLUMNS: PdfColumn[] = [
  { header: 'Categoría', width: '*' },
  { header: 'Líneas', width: 'auto', align: 'right' },
  { header: 'Monto', width: 'auto', align: 'right' },
];

export interface RepairDocumentInput {
  branchName: string | null;
  query: BranchRepairExpensesQuery;
  rows: BranchRepairExpenseRow[];
  totals: RepairTotals;
  groups: RepairCategoryShare[];
  busLabel: string | null;
  categoryName: string | null;
  now: Date;
}

const sumLines = (categories: RepairCategoryShare[]): number =>
  categories.reduce((sum, category) => sum + category.lines, 0);

const busTitle = (row: BranchRepairExpenseRow): string =>
  row.plate === null
    ? UNKNOWN_BUS
    : `${formatPlate(row.plate)} · ${row.brand ?? ''} ${row.model ?? ''}`.trimEnd();

const busRows = (row: BranchRepairExpenseRow): PdfRow[] => [
  { cells: [busTitle(row), '', '', ''], tone: 'group' },
  ...row.categories.map((category) => ({
    cells: [category.categoryName, '', String(category.lines), formatMoney(category.amount)],
  })),
  {
    cells: [
      'Total del bus',
      String(row.expenses),
      String(sumLines(row.categories)),
      formatMoney(row.total),
    ],
    tone: 'subtotal',
  },
];

const categoryTable = (groups: RepairCategoryShare[], totals: RepairTotals): PdfTable => ({
  title: 'Totales por categoría',
  columns: CATEGORY_COLUMNS,
  rows: [
    ...groups.map((group) => ({
      cells: [group.categoryName, String(group.lines), formatMoney(group.amount)],
    })),
    {
      cells: ['Gran total', String(sumLines(groups)), formatMoney(totals.total)],
      tone: 'total',
    },
  ],
  emptyMessage: '',
});

export function toReportDocument({
  branchName,
  query,
  rows,
  totals,
  groups,
  busLabel,
  categoryName,
  now,
}: RepairDocumentInput): ReportDocument {
  const filters = [
    ...(query.busId ? [`Bus: ${busLabel ?? UNKNOWN_BUS}`] : []),
    ...(query.categoryId ? [`Categoría: ${categoryName ?? 'Sin datos'}`] : []),
  ];

  return {
    title: 'Gastos de taller por bus y categoría',
    scope: branchName ? `Sucursal ${branchName}` : 'Sucursal',
    period: reportPeriod(query.from, query.to),
    filters,
    highlights: [
      { label: 'Buses', value: String(totals.buses) },
      { label: 'Gastos', value: String(totals.expenses) },
      { label: 'Total', value: formatMoney(totals.total) },
    ],
    tables: [
      {
        columns: BUS_COLUMNS,
        rows: rows.flatMap(busRows),
        emptyMessage: 'No hay gastos de taller con esos filtros.',
      },
      ...(groups.length === 0 ? [] : [categoryTable(groups, totals)]),
    ],
    notes: [],
    generatedAt: now,
    landscape: false,
  };
}
