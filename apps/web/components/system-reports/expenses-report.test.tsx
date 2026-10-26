import type { SystemExpenseRow, SystemExpensesPage } from '@debus/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useBranchOptions } from '../../hooks/use-branches';
import { useReport } from '../../hooks/use-report';
import { useReportPdf } from '../../hooks/use-report-pdf';
import { formatQuetzales } from '../../lib/format';
import {
  BRANCH_IDS,
  branchOptions,
  lastAddress,
  plain,
  reportState,
  stubReducedMotion,
} from '../../test-support/system-reports';
import { ExpensesReport } from './expenses-report';

jest.mock('../../hooks/use-report');
jest.mock('../../hooks/use-report-pdf');
jest.mock('../../hooks/use-branches');
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/admin/reportes/gastos',
  useSearchParams: () => new URLSearchParams(search),
}));

const money = (value: number) => plain(formatQuetzales(value));
const user = userEvent.setup({ applyAccept: false });

const expense = (over: Partial<SystemExpenseRow> = {}): SystemExpenseRow => ({
  id: 'trip-1:FUEL',
  branchId: BRANCH_IDS.coban,
  branchName: 'Cobán',
  concept: 'FUEL',
  day: '2026-10-05',
  busPlate: 'C482BTX',
  originLabel: 'Cobán',
  destinationLabel: 'Ciudad de Guatemala',
  categoryName: null,
  description: null,
  amount: 1180,
  ...over,
});

const rows = [
  expense(),
  expense({ id: 'trip-1:DEPRECIATION', concept: 'DEPRECIATION', amount: 204 }),
  expense({
    id: 'e-1:0',
    branchId: BRANCH_IDS.xela,
    branchName: 'Quetzaltenango',
    concept: 'LABOR',
    originLabel: null,
    destinationLabel: null,
    categoryName: 'Motor',
    description: 'Cambio de bomba',
    amount: 1200,
  }),
  expense({
    id: 'e-1:1',
    branchId: BRANCH_IDS.xela,
    branchName: 'Quetzaltenango',
    concept: 'PART',
    busPlate: null,
    originLabel: null,
    destinationLabel: null,
    categoryName: 'Llantas',
    description: 'Dos llantas',
    amount: 4000,
  }),
];

const answer = (
  items: SystemExpenseRow[] = rows,
  over: Partial<SystemExpensesPage> = {},
): SystemExpensesPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  summary: {
    totals: { entries: 4, amount: 6584, fuel: 1180, depreciation: 204, labor: 1200, parts: 4000 },
    groups:
      items.length === 0
        ? []
        : [
            { branchId: BRANCH_IDS.coban, branchName: 'Cobán', entries: 2, amount: 1384 },
            { branchId: BRANCH_IDS.xela, branchName: 'Quetzaltenango', entries: 2, amount: 5200 },
          ],
  },
  ...over,
});

const exportPdf = jest.fn();
function setup({
  data = answer(),
  address = '',
  error = false,
  pending = false,
}: { data?: SystemExpensesPage; address?: string; error?: boolean; pending?: boolean } = {}) {
  search = address;
  const refetch = jest.fn();
  jest.mocked(useBranchOptions).mockReturnValue(branchOptions() as never);
  jest.mocked(useReport).mockReturnValue(reportState({ data, error, pending, refetch }));
  jest.mocked(useReportPdf).mockReturnValue({ exportPdf, exporting: false });
  render(<ExpensesReport />);
  return { refetch };
}

beforeEach(() => {
  replace.mockReset();
  exportPdf.mockReset();
  stubReducedMotion();
});

describe('ExpensesReport', () => {
  it('names the report and asks the server for the query of the address', () => {
    setup({ address: `desde=2026-10-01&sucursal=${BRANCH_IDS.xela}&mostrar=50` });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Gastos por sucursal' }),
    ).toBeInTheDocument();
    const [path, params] = jest.mocked(useReport).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/system-expenses');
    expect(params.toString()).toBe(
      `branchId=${BRANCH_IDS.xela}&from=2026-10-01&page=1&pageSize=50`,
    );
  });

  it('describes each expense by what it is: the route of a trip or the work done in the workshop', () => {
    setup();

    const table = screen.getByRole('table', { name: 'Gastos por sucursal' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Sucursal', 'Fecha', 'Concepto', 'Bus', 'Detalle', 'Monto']);
    const fuel = within(
      screen.getAllByRole('row').find((r) => within(r).queryByText('Combustible'))!,
    );
    expect(fuel.getByText('Cobán → Ciudad de Guatemala')).toBeInTheDocument();
    expect(fuel.getByText('C-482BTX')).toBeInTheDocument();
    expect(fuel.getByText(money(1180))).toBeInTheDocument();
    expect(screen.getByText('Depreciación', { selector: 'td span' })).toBeInTheDocument();
    const labor = within(screen.getByRole('row', { name: /Mano de obra/ }));
    expect(labor.getByText('Cambio de bomba')).toBeInTheDocument();
    expect(labor.getByText('Motor')).toBeInTheDocument();
    const part = within(screen.getByRole('row', { name: /Repuestos/ }));
    expect(part.getByText('Bus sin datos')).toBeInTheDocument();
  });

  it('adds up each branch under its last row and every branch at the end', () => {
    setup();

    const coban = screen.getByRole('row', { name: 'Subtotal de Cobán' });
    expect(within(coban).getByText(money(1384))).toBeInTheDocument();
    expect(within(coban).getByText('2 gastos')).toBeInTheDocument();
    expect(
      within(screen.getByRole('row', { name: 'Subtotal de Quetzaltenango' })).getByText(
        money(5200),
      ),
    ).toBeInTheDocument();
    const total = screen.getByRole('row', { name: 'Total global' });
    expect(total).toBe(screen.getAllByRole('row').at(-1));
    expect(within(total).getByText(money(6584))).toBeInTheDocument();
  });

  it('highlights the total and each kind of expense, and draws the bars by branch', () => {
    setup();

    const highlights = within(screen.getByRole('region', { name: 'Resumen del reporte' }));
    for (const label of ['Gastos totales', 'Combustible', 'Depreciación', 'Taller', 'Repuestos']) {
      expect(highlights.getByText(label)).toBeInTheDocument();
    }
    expect(highlights.getByText(money(6584))).toBeInTheDocument();
    expect(highlights.getByText(money(4000))).toBeInTheDocument();
    const bars = within(
      screen.getByRole('heading', { name: 'Gastos de cada sucursal' }).closest('section')!,
    );
    expect(bars.getByText(money(5200))).toBeInTheDocument();
  });

  it('writes the branch in the address and exports with the same filters and no page', async () => {
    setup({ address: `pagina=2&sucursal=${BRANCH_IDS.xela}` });

    await user.click(screen.getByRole('combobox', { name: 'Sucursal' }));
    await user.click(await screen.findByRole('option', { name: 'Cobán' }));
    expect(lastAddress(replace).params.get('sucursal')).toBe(BRANCH_IDS.coban);
    expect(lastAddress(replace).params.has('pagina')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    const [path, params, stem] = jest.mocked(useReportPdf).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/system-expenses');
    expect(params.toString()).toBe(`branchId=${BRANCH_IDS.xela}`);
    expect(stem).toBe('reporte-gastos');
    expect(exportPdf).toHaveBeenCalled();
  });

  it.each([
    ['hasta=2026-10-01', 'Todavía no hay gastos en este periodo.'],
    [`sucursal=${BRANCH_IDS.coban}`, 'Esa sucursal todavía no tiene gastos.'],
    ['', 'Todavía no hay gastos registrados.'],
  ])('explains an empty report (%s)', (address, message) => {
    setup({ data: answer([]), address });

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Gastos de cada sucursal' }),
    ).not.toBeInTheDocument();
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
