import type {
  RepairCategoryShare,
  SystemRepairExpenseRow,
  SystemRepairExpensesPage,
} from '@debus/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useBranchOptions } from '../../hooks/use-branches';
import { useReport } from '../../hooks/use-report';
import { useReportPdf } from '../../hooks/use-report-pdf';
import { useSystemBusOptions } from '../../hooks/use-system-bus-options';
import { formatQuetzales } from '../../lib/format';
import {
  BRANCH_IDS,
  branchOptions,
  lastAddress,
  plain,
  reportState,
  stubReducedMotion,
} from '../../test-support/system-reports';
import { RepairCategoryReport } from './repair-category-report';

jest.mock('../../hooks/use-report');
jest.mock('../../hooks/use-report-pdf');
jest.mock('../../hooks/use-branches');
jest.mock('../../hooks/use-system-bus-options');
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/admin/reportes/taller',
  useSearchParams: () => new URLSearchParams(search),
}));

const money = (value: number) => plain(formatQuetzales(value));
const user = userEvent.setup({ applyAccept: false });
const BUS_ID = '6e5f4a3b-9c8d-4e7f-8a0b-2c3d4e5f6a7b';
const TIRES = '2c3d4e5f-6071-4b82-9c93-a4b5c6d7e8f9';
const OIL = '1b2c3d4e-5f60-4a71-8b82-93a4b5c6d7e8';

const line = (over: Partial<SystemRepairExpenseRow> = {}): SystemRepairExpenseRow => ({
  expenseId: '3d4e5f60-7182-4c93-8da4-b5c6d7e8f9a0',
  lineNo: 0,
  categoryId: TIRES,
  categoryName: 'Llantas',
  busId: BUS_ID,
  busPlate: 'C482BTX',
  branchId: BRANCH_IDS.xela,
  branchName: 'Quetzaltenango',
  serviceDate: '2026-10-20',
  kind: 'PART',
  description: 'Dos llantas traseras',
  amount: 5200,
  ...over,
});

const rows = [
  line(),
  line({
    lineNo: 1,
    categoryId: OIL,
    categoryName: 'Cambio de aceite',
    kind: 'LABOR',
    busPlate: null,
    description: 'Cambio completo',
    amount: 350.5,
  }),
];

const groups: RepairCategoryShare[] = [
  { categoryId: TIRES, categoryName: 'Llantas', lines: 1, amount: 5200 },
  { categoryId: OIL, categoryName: 'Cambio de aceite', lines: 1, amount: 350.5 },
];

const answer = (
  items: SystemRepairExpenseRow[] = rows,
  over: Partial<SystemRepairExpensesPage> = {},
): SystemRepairExpensesPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  summary: {
    totals: { lines: 2, expenses: 1, amount: 5550.5 },
    groups: items.length === 0 ? [] : groups,
  },
  ...over,
});

const exportPdf = jest.fn();
function setup({
  data = answer(),
  address = '',
  error = false,
  pending = false,
}: {
  data?: SystemRepairExpensesPage;
  address?: string;
  error?: boolean;
  pending?: boolean;
} = {}) {
  search = address;
  const refetch = jest.fn();
  jest.mocked(useBranchOptions).mockReturnValue(branchOptions() as never);
  jest.mocked(useSystemBusOptions).mockReturnValue({
    data: {
      items: [
        {
          id: BUS_ID,
          plate: 'C482BTX',
          brand: 'Volvo',
          model: 'B8R',
          branchName: 'Quetzaltenango',
        },
      ],
      total: 1,
    },
  } as never);
  jest.mocked(useReport).mockReturnValue(reportState({ data, error, pending, refetch }));
  jest.mocked(useReportPdf).mockReturnValue({ exportPdf, exporting: false });
  render(<RepairCategoryReport />);
  return { refetch };
}

beforeEach(() => {
  replace.mockReset();
  exportPdf.mockReset();
  stubReducedMotion();
});

describe('RepairCategoryReport', () => {
  it('names the report and asks the server for the query of the address', () => {
    setup({ address: `sucursal=${BRANCH_IDS.xela}&bus=${BUS_ID}&desde=2026-10-01&pagina=2` });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Gastos de taller por categoría' }),
    ).toBeInTheDocument();
    const [path, params] = jest.mocked(useReport).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/system-repair-expenses');
    expect(params.toString()).toBe(
      `branchId=${BRANCH_IDS.xela}&busId=${BUS_ID}&from=2026-10-01&page=2&pageSize=20`,
    );
  });

  it('lists a row per line of work under its category, with the date, the bus and the branch', () => {
    setup();

    const table = screen.getByRole('table', { name: 'Gastos de taller por categoría' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Categoría', 'Fecha', 'Bus', 'Sucursal', 'Tipo', 'Descripción', 'Monto']);
    const tires = within(screen.getByRole('row', { name: /Dos llantas traseras/ }));
    expect(tires.getByText('Llantas')).toBeInTheDocument();
    expect(tires.getByText('C-482BTX')).toBeInTheDocument();
    expect(tires.getByText('Quetzaltenango')).toBeInTheDocument();
    expect(tires.getByText('Repuestos')).toBeInTheDocument();
    expect(tires.getByText(money(5200))).toBeInTheDocument();
    const oil = within(screen.getByRole('row', { name: /Cambio completo/ }));
    expect(oil.getByText('Mano de obra')).toBeInTheDocument();
    expect(oil.getByText('Bus sin datos')).toBeInTheDocument();
  });

  it('adds up each category under its last line and the whole workshop at the end', () => {
    setup();

    const tires = screen.getByRole('row', { name: 'Subtotal de Llantas' });
    expect(within(tires).getByText(money(5200))).toBeInTheDocument();
    expect(within(tires).getByText('1 línea')).toBeInTheDocument();
    expect(
      within(screen.getByRole('row', { name: 'Subtotal de Cambio de aceite' })).getByText(
        money(350.5),
      ),
    ).toBeInTheDocument();
    const total = screen.getByRole('row', { name: 'Total general' });
    expect(total).toBe(screen.getAllByRole('row').at(-1));
    expect(within(total).getByText(money(5550.5))).toBeInTheDocument();
    expect(within(total).getByText('2 líneas')).toBeInTheDocument();
  });

  it('highlights the spending of the whole filter and shows it by category as bars', () => {
    setup();

    const highlights = within(screen.getByRole('region', { name: 'Resumen del reporte' }));
    expect(highlights.getByText('Gasto total')).toBeInTheDocument();
    expect(highlights.getByText(money(5550.5))).toBeInTheDocument();
    expect(highlights.getByText('Líneas')).toBeInTheDocument();
    expect(highlights.getByText('Gastos de taller')).toBeInTheDocument();
    const bars = within(
      screen.getByRole('heading', { name: 'Gasto por categoría' }).closest('section')!,
    );
    expect(bars.getByText('Cambio de aceite')).toBeInTheDocument();
    expect(bars.getByText(money(350.5))).toBeInTheDocument();
  });

  it('offers the buses of every branch, searching on the server, and writes the bus in the address', async () => {
    setup({ address: 'pagina=2' });
    expect(screen.getByRole('combobox', { name: 'Bus' })).toHaveTextContent('Todos los buses');

    await user.click(screen.getByRole('combobox', { name: 'Bus' }));
    await user.click(await screen.findByRole('option', { name: 'C-482BTX · Quetzaltenango' }));

    expect(lastAddress(replace).params.get('bus')).toBe(BUS_ID);
    expect(lastAddress(replace).params.has('pagina')).toBe(false);
    expect(useSystemBusOptions).toHaveBeenCalledWith({});
  });

  it('narrows the list of buses to the branch that is chosen', () => {
    setup({ address: `sucursal=${BRANCH_IDS.xela}` });

    expect(useSystemBusOptions).toHaveBeenCalledWith({ branchId: BRANCH_IDS.xela });
  });

  it('drops the bus when the branch changes, because it may belong to another one', async () => {
    setup({ address: `sucursal=${BRANCH_IDS.xela}&bus=${BUS_ID}` });

    await user.click(screen.getByRole('combobox', { name: 'Sucursal' }));
    await user.click(await screen.findByRole('option', { name: 'Cobán' }));

    const { params } = lastAddress(replace);
    expect(params.get('sucursal')).toBe(BRANCH_IDS.coban);
    expect(params.has('bus')).toBe(false);
  });

  it('clears the period, the branch and the bus together', async () => {
    setup({ address: `desde=2026-10-01&sucursal=${BRANCH_IDS.xela}&bus=${BUS_ID}` });

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(lastAddress(replace).params.toString()).toBe('');
  });

  it('offers clearing when only the bus narrows the report', () => {
    setup({ address: `bus=${BUS_ID}` });

    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument();
  });

  it('exports with the same filters and no page', async () => {
    setup({ address: `bus=${BUS_ID}&sucursal=${BRANCH_IDS.xela}&pagina=2` });

    await user.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    const [path, params, stem] = jest.mocked(useReportPdf).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/system-repair-expenses');
    expect(params.toString()).toBe(`branchId=${BRANCH_IDS.xela}&busId=${BUS_ID}`);
    expect(stem).toBe('reporte-taller');
    expect(exportPdf).toHaveBeenCalled();
  });

  it.each([
    ['desde=2026-10-01', 'Todavía no hay gastos de taller en este periodo.'],
    [`bus=${BUS_ID}`, 'Ese bus todavía no tiene gastos de taller.'],
    [`sucursal=${BRANCH_IDS.coban}`, 'Esa sucursal todavía no tiene gastos de taller.'],
    ['', 'Todavía no hay gastos de taller registrados.'],
  ])('explains an empty report (%s)', (address, message) => {
    setup({ data: answer([]), address });

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: 'Total general' })).not.toBeInTheDocument();
  });

  it('shows the skeleton while it loads', () => {
    setup({ pending: true });

    expect(screen.getAllByLabelText('Cargando').length).toBeGreaterThan(0);
  });

  it('says it could not load the report and tries again on request', async () => {
    const { refetch } = setup({ error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el reporte.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });
});
