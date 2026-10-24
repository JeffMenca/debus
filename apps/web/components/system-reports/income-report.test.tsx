import type { SystemIncomePage, SystemIncomeRow } from '@debus/contracts';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
import { IncomeReport } from './income-report';

jest.mock('../../hooks/use-report');
jest.mock('../../hooks/use-report-pdf');
jest.mock('../../hooks/use-branches');
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/admin/reportes/ingresos',
  useSearchParams: () => new URLSearchParams(search),
}));

const money = (value: number) => plain(formatQuetzales(value));
const user = userEvent.setup({ applyAccept: false });

const sale = (over: Partial<SystemIncomeRow> = {}): SystemIncomeRow => ({
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae1',
  branchId: BRANCH_IDS.coban,
  branchName: 'Cobán',
  concept: 'ONLINE_TICKET',
  day: '2026-10-05',
  originLabel: 'Cobán',
  destinationLabel: 'Ciudad de Guatemala',
  clientName: null,
  quantity: 2,
  amount: 170,
  ...over,
});

const rows = [
  sale(),
  sale({
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae2',
    concept: 'COUNTER_TICKET',
    quantity: 1,
    amount: 85,
  }),
  sale({
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae3',
    branchId: BRANCH_IDS.xela,
    branchName: 'Quetzaltenango',
    concept: 'RENTAL',
    originLabel: 'Quetzaltenango',
    destinationLabel: 'Antigua Guatemala',
    clientName: 'Marta Ruiz',
    quantity: 30,
    amount: 2760,
  }),
];

const answer = (
  items: SystemIncomeRow[] = rows,
  over: Partial<SystemIncomePage> = {},
): SystemIncomePage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  summary: {
    totals: { entries: 3, amount: 3015, onlineTickets: 170, counterTickets: 85, rentals: 2760 },
    groups:
      items.length === 0
        ? []
        : [
            { branchId: BRANCH_IDS.coban, branchName: 'Cobán', entries: 2, amount: 255 },
            { branchId: BRANCH_IDS.xela, branchName: 'Quetzaltenango', entries: 1, amount: 2760 },
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
  placeholder = false,
}: {
  data?: SystemIncomePage;
  address?: string;
  error?: boolean;
  pending?: boolean;
  placeholder?: boolean;
} = {}) {
  search = address;
  const refetch = jest.fn();
  jest.mocked(useBranchOptions).mockReturnValue(branchOptions() as never);
  jest
    .mocked(useReport)
    .mockReturnValue(reportState({ data, error, pending, placeholder, refetch }));
  jest.mocked(useReportPdf).mockReturnValue({ exportPdf, exporting: false });
  render(<IncomeReport />);
  return { refetch };
}

beforeEach(() => {
  replace.mockReset();
  exportPdf.mockReset();
  stubReducedMotion();
});

describe('IncomeReport', () => {
  it('names the report for every branch and has a single primary button', () => {
    setup();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Ingresos por sucursal' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Reportes · todas las sucursales')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toHaveClass('bg-primary');
  });

  it('asks the report for the query of the address', () => {
    setup({
      address: `desde=2026-10-01&hasta=2026-10-13&sucursal=${BRANCH_IDS.coban}&pagina=2`,
    });

    const [path, params] = jest.mocked(useReport).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/system-income');
    expect(params.toString()).toBe(
      `branchId=${BRANCH_IDS.coban}&from=2026-10-01&page=2&pageSize=20&to=2026-10-13`,
    );
  });

  it('lists a row per sale with its concept, its detail, its quantity and its amount', () => {
    setup();

    const table = screen.getByRole('table', { name: 'Ingresos por sucursal' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Sucursal', 'Fecha de pago', 'Concepto', 'Detalle', 'Cantidad', 'Monto']);
    const online = within(
      within(table)
        .getAllByRole('row')
        .find((row) => within(row).queryByText('Boleto en línea'))!,
    );
    expect(online.getByText('Cobán → Ciudad de Guatemala')).toBeInTheDocument();
    expect(online.getByText(money(170))).toBeInTheDocument();
    const rental = within(screen.getByRole('row', { name: /Alquiler/ }));
    expect(rental.getByText('Marta Ruiz')).toBeInTheDocument();
    expect(rental.getByText('Quetzaltenango → Antigua Guatemala')).toBeInTheDocument();
    expect(rental.getByText(money(2760))).toBeInTheDocument();
    expect(screen.getByText('Boleto de ventanilla')).toBeInTheDocument();
  });

  it('puts a subtotal under the last row of each branch and the total of every branch at the end', () => {
    setup();

    const [first, second, third, fourth, fifth] = within(
      screen.getByRole('table', { name: 'Ingresos por sucursal' }),
    )
      .getAllByRole('row')
      .slice(1);
    expect(first).toHaveTextContent('Boleto en línea');
    expect(second).toHaveTextContent('Boleto de ventanilla');
    expect(third).toBe(screen.getByRole('row', { name: 'Subtotal de Cobán' }));
    expect(within(third!).getByText(money(255))).toBeInTheDocument();
    expect(fourth).toHaveTextContent('Alquiler');
    expect(fifth).toBe(screen.getByRole('row', { name: 'Subtotal de Quetzaltenango' }));
    const total = screen.getByRole('row', { name: 'Total global' });
    expect(total).toBe(screen.getAllByRole('row').at(-1));
    expect(within(total).getByText(money(3015))).toBeInTheDocument();
    expect(within(total).getByText('3 ventas')).toBeInTheDocument();
  });

  it('counts the rows of the server in the pager, not the subtotals it adds', () => {
    setup();

    expect(screen.getByText('Mostrando 1–3 de 3')).toBeInTheDocument();
  });

  it('goes to the last page there is when the one asked for is past the end', () => {
    setup({ data: answer([], { total: 25, page: 3 }), address: 'pagina=3' });

    expect(lastAddress(replace).params.get('pagina')).toBe('2');
  });

  it('leaves the total for the last page', () => {
    setup({ data: answer(rows, { total: 45 }) });

    expect(screen.queryByRole('row', { name: 'Total global' })).not.toBeInTheDocument();
  });

  it('highlights the income of the whole filter by concept', () => {
    setup();

    const highlights = within(screen.getByRole('region', { name: 'Resumen del reporte' }));
    expect(highlights.getByText('Ingresos totales')).toBeInTheDocument();
    expect(highlights.getByText(money(3015))).toBeInTheDocument();
    expect(highlights.getByText('Boletos en línea')).toBeInTheDocument();
    expect(highlights.getByText('Boletos de ventanilla')).toBeInTheDocument();
    expect(highlights.getByText('Alquileres')).toBeInTheDocument();
    expect(highlights.getByText(money(2760))).toBeInTheDocument();
  });

  it('shows the income of each branch as bars', () => {
    setup();

    const bars = within(
      screen
        .getByRole('heading', { name: 'Ingresos de cada sucursal', level: 2 })
        .closest('section')!,
    );
    expect(bars.getByText('Cobán')).toBeInTheDocument();
    expect(bars.getByText(money(255))).toBeInTheDocument();
    expect(bars.getByText(money(2760))).toBeInTheDocument();
  });

  it('leaves the bars out when there is no income', () => {
    setup({ data: answer([]) });

    expect(
      screen.queryByRole('heading', { name: 'Ingresos de cada sucursal', level: 2 }),
    ).not.toBeInTheDocument();
  });

  it('starts with every record and every branch and writes the applied period in the address', async () => {
    setup({ address: 'pagina=3' });
    expect(screen.getByRole('button', { name: /Periodo/ })).toHaveTextContent(
      'Todos los registros',
    );
    expect(screen.getByRole('combobox', { name: 'Sucursal' })).toHaveTextContent(
      'Todas las sucursales',
    );

    await user.click(screen.getByRole('button', { name: /Periodo/ }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-13' } });
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    const { path, params } = lastAddress(replace);
    expect(path).toBe('/admin/reportes/ingresos');
    expect(params.get('desde')).toBe('2026-10-01');
    expect(params.get('hasta')).toBe('2026-10-13');
    expect(params.has('pagina')).toBe(false);
  });

  it('writes the branch in the address and goes back to the first page', async () => {
    setup({ address: 'pagina=2' });

    await user.click(screen.getByRole('combobox', { name: 'Sucursal' }));
    await user.click(await screen.findByRole('option', { name: 'Cobán' }));

    expect(lastAddress(replace).params.get('sucursal')).toBe(BRANCH_IDS.coban);
    expect(lastAddress(replace).params.has('pagina')).toBe(false);
  });

  it('takes the branch out of the address with "all"', async () => {
    setup({ address: `sucursal=${BRANCH_IDS.coban}` });

    await user.click(screen.getByRole('combobox', { name: 'Sucursal' }));
    await user.click(await screen.findByRole('option', { name: 'Todas las sucursales' }));

    expect(lastAddress(replace).params.has('sucursal')).toBe(false);
  });

  it('asks for the branches that closed too, since they have history', () => {
    setup();

    expect(useBranchOptions).toHaveBeenCalledWith({ status: 'all' });
  });

  it('offers no clearing when nothing narrows the report', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it('clears everything the address narrows by', async () => {
    setup({ address: `desde=2026-10-01&sucursal=${BRANCH_IDS.coban}&pagina=2` });

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(lastAddress(replace).params.toString()).toBe('');
  });

  it('exports with the same filters the table has and without the page', async () => {
    setup({ address: `desde=2026-10-01&sucursal=${BRANCH_IDS.coban}&pagina=2&mostrar=50` });

    await user.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    expect(exportPdf).toHaveBeenCalledTimes(1);
    const [path, params, stem] = jest.mocked(useReportPdf).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/system-income');
    expect(params.get('from')).toBe('2026-10-01');
    expect(params.get('branchId')).toBe(BRANCH_IDS.coban);
    expect(params.has('page')).toBe(false);
    expect(params.has('pageSize')).toBe(false);
    expect(stem).toBe('reporte-ingresos');
  });

  it.each([
    ['desde=2026-10-01', 'Todavía no hay ingresos en este periodo.'],
    [`sucursal=${BRANCH_IDS.coban}`, 'Esa sucursal todavía no tiene ingresos.'],
    ['', 'Todavía no hay ingresos registrados.'],
  ])('explains an empty report (%s)', (address, message) => {
    setup({ data: answer([]), address });

    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('shows the skeleton while it loads and no total', () => {
    setup({ pending: true });

    expect(screen.getAllByLabelText('Cargando').length).toBeGreaterThan(0);
    expect(screen.queryByRole('row', { name: 'Total global' })).not.toBeInTheDocument();
  });

  it('dims the table while the next page arrives', () => {
    setup({ placeholder: true });

    expect(
      screen.getByRole('table', { name: 'Ingresos por sucursal' }).closest('section'),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('says it could not load the report and tries again on request', async () => {
    const { refetch } = setup({ error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el reporte.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });
});
