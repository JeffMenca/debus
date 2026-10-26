import type { SystemProfitPage, SystemProfitRow } from '@debus/contracts';
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
import { ProfitReport } from './profit-report';

jest.mock('../../hooks/use-report');
jest.mock('../../hooks/use-report-pdf');
jest.mock('../../hooks/use-branches');
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/admin/reportes/ganancias',
  useSearchParams: () => new URLSearchParams(search),
}));

const money = (value: number) => plain(formatQuetzales(value));
const user = userEvent.setup({ applyAccept: false });

const profit = (over: Partial<SystemProfitRow> = {}): SystemProfitRow => ({
  branchId: BRANCH_IDS.xela,
  branchName: 'Quetzaltenango',
  ticketIncome: 241900,
  rentalIncome: 64300,
  income: 306200,
  fuel: 92600,
  labor: 21040,
  parts: 14700,
  depreciation: 35980,
  expenses: 164320,
  profit: 141880,
  margin: 46.3,
  ...over,
});

const rows = [
  profit(),
  profit({
    branchId: BRANCH_IDS.coban,
    branchName: 'Cobán',
    ticketIncome: 0,
    rentalIncome: 0,
    income: 0,
    fuel: 1250,
    labor: 0,
    parts: 0,
    depreciation: 0,
    expenses: 1250,
    profit: -1250,
    margin: null,
  }),
];

const answer = (
  items: SystemProfitRow[] = rows,
  over: Partial<SystemProfitPage> = {},
): SystemProfitPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  summary: {
    totals: {
      ticketIncome: 241900,
      rentalIncome: 64300,
      income: 306200,
      fuel: 93850,
      labor: 21040,
      parts: 14700,
      depreciation: 35980,
      expenses: 165570,
      profit: 140630,
      margin: 45.9,
    },
    groups: [],
  },
  ...over,
});

const exportPdf = jest.fn();
function setup({
  data = answer(),
  address = '',
  error = false,
  pending = false,
}: { data?: SystemProfitPage; address?: string; error?: boolean; pending?: boolean } = {}) {
  search = address;
  const refetch = jest.fn();
  jest.mocked(useBranchOptions).mockReturnValue(branchOptions() as never);
  jest.mocked(useReport).mockReturnValue(reportState({ data, error, pending, refetch }));
  jest.mocked(useReportPdf).mockReturnValue({ exportPdf, exporting: false });
  render(<ProfitReport />);
  return { refetch };
}

beforeEach(() => {
  replace.mockReset();
  exportPdf.mockReset();
  stubReducedMotion();
});

describe('ProfitReport', () => {
  it('names the report and asks the server for the query of the address', () => {
    setup({ address: `sucursal=${BRANCH_IDS.xela}&desde=2026-10-01` });

    expect(screen.getByRole('heading', { level: 1, name: 'Ganancias' })).toBeInTheDocument();
    const [path, params] = jest.mocked(useReport).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/system-profit');
    expect(params.toString()).toBe(
      `branchId=${BRANCH_IDS.xela}&from=2026-10-01&page=1&pageSize=20`,
    );
  });

  it('shows a row per branch with its income, its expenses, its profit and its margin', () => {
    setup();

    const table = screen.getByRole('table', { name: 'Ganancias por sucursal' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Sucursal', 'Ingresos', 'Gastos', 'Ganancia neta', 'Margen']);
    const xela = within(screen.getByRole('row', { name: /Quetzaltenango/ }));
    expect(xela.getByText(money(306200))).toBeInTheDocument();
    expect(xela.getByText(money(164320))).toBeInTheDocument();
    expect(xela.getByText(money(141880))).toBeInTheDocument();
    expect(xela.getByText('46.3 %')).toBeInTheDocument();
  });

  it('shows a loss as a negative amount and a margin without income as a dash', () => {
    setup();

    const coban = within(screen.getByRole('row', { name: /Cobán/ }));
    expect(coban.getByText(money(-1250))).toBeInTheDocument();
    expect(coban.getByText('—')).toBeInTheDocument();
  });

  it('adds the total of every branch at the end with its margin', () => {
    setup();

    const total = screen.getByRole('row', { name: 'Total global' });
    expect(total).toBe(screen.getAllByRole('row').at(-1));
    expect(within(total).getByText(money(306200))).toBeInTheDocument();
    expect(within(total).getByText(money(165570))).toBeInTheDocument();
    expect(within(total).getByText(money(140630))).toBeInTheDocument();
    expect(within(total).getByText('45.9 %')).toBeInTheDocument();
  });

  it('highlights income, expenses and the net profit with its margin', () => {
    setup();

    const highlights = within(screen.getByRole('region', { name: 'Resumen del reporte' }));
    expect(highlights.getByText('Ingresos')).toBeInTheDocument();
    expect(highlights.getByText('Gastos')).toBeInTheDocument();
    expect(highlights.getByText('Ganancia neta')).toBeInTheDocument();
    expect(highlights.getByText(money(140630))).toBeInTheDocument();
    expect(highlights.getByText('Margen 45.9 %')).toBeInTheDocument();
  });

  it('draws the net profit of each branch as bars, and a loss as an empty bar', () => {
    setup();

    const bars = within(
      screen.getByRole('heading', { name: 'Ganancia neta por sucursal' }).closest('section')!,
    );
    expect(bars.getByText(money(141880))).toBeInTheDocument();
    expect(bars.getByText(money(-1250))).toBeInTheDocument();
  });

  it('opens a branch to show where its income came from and where its expenses went', async () => {
    setup();
    const toggle = screen.getByRole('button', { name: /Quetzaltenango/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('region', { name: 'Desglose de Quetzaltenango' }),
    ).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const detail = within(screen.getByRole('region', { name: 'Desglose de Quetzaltenango' }));
    const chips: [string, number, string][] = [
      ['Boletos', 241900, '+'],
      ['Alquileres', 64300, '+'],
      ['Combustible', 92600, '-'],
      ['Taller', 21040, '-'],
      ['Repuestos', 14700, '-'],
      ['Depreciación', 35980, '-'],
    ];
    for (const [label, amount, sign] of chips) {
      expect(detail.getByText(label)).toBeInTheDocument();
      expect(detail.getByText(`${sign} ${money(amount)}`)).toBeInTheDocument();
    }
    expect(detail.getByText('Boletos').closest('li')).toHaveClass('bg-mint-100');
    expect(detail.getByText('Combustible').closest('li')).toHaveClass('bg-coral-100');

    await user.click(toggle);
    expect(
      screen.queryByRole('region', { name: 'Desglose de Quetzaltenango' }),
    ).not.toBeInTheDocument();
  });

  it('writes the branch in the address and exports with the same filters and no page', async () => {
    setup({ address: 'pagina=2' });

    await user.click(screen.getByRole('combobox', { name: 'Sucursal' }));
    await user.click(await screen.findByRole('option', { name: 'Cobán' }));
    expect(lastAddress(replace).params.get('sucursal')).toBe(BRANCH_IDS.coban);

    await user.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    const [path, params, stem] = jest.mocked(useReportPdf).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/system-profit');
    expect(params.has('page')).toBe(false);
    expect(stem).toBe('reporte-ganancias');
    expect(exportPdf).toHaveBeenCalled();
  });

  it.each([
    ['desde=2026-10-01', 'Todavía no hay movimientos en este periodo.'],
    [`sucursal=${BRANCH_IDS.coban}`, 'Esa sucursal todavía no tiene movimientos.'],
    ['', 'Todavía no hay sucursales con movimientos.'],
  ])('explains an empty report (%s)', (address, message) => {
    setup({ data: answer([]), address });

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Ganancia neta por sucursal' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('row', { name: 'Total global' })).not.toBeInTheDocument();
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
