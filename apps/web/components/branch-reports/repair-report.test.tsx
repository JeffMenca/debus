import type { BranchRepairExpenseRow, BranchRepairExpensesPage } from '@debus/contracts';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useBusesPage } from '../../hooks/use-buses';
import { useExpenseCategoriesPage } from '../../hooks/use-expense-categories';
import { useReport } from '../../hooks/use-report';
import { useReportPdf } from '../../hooks/use-report-pdf';
import { formatQuetzales } from '../../lib/format';
import { CATEGORY_IDS, category, page } from '../../test-support/expenses';
import { bus, busPage } from '../../test-support/fleet';
import { RepairReport } from './repair-report';

jest.mock('../../hooks/use-report');
jest.mock('../../hooks/use-report-pdf');
jest.mock('../../hooks/use-buses');
jest.mock('../../hooks/use-expense-categories');
jest.mock('../../hooks/use-own-branch', () => ({
  useOwnBranch: () => ({ id: 'br', name: 'Quetzaltenango' }),
}));
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/reportes/taller',
  useSearchParams: () => new URLSearchParams(search),
}));

// The currency format of the browser separates the symbol with a no-break space.
const money = (value: number) => formatQuetzales(value).replace(/\s/g, ' ');

const user = userEvent.setup({ applyAccept: false });
const BUS_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const row = (over: Partial<BranchRepairExpenseRow> = {}): BranchRepairExpenseRow => ({
  busId: BUS_ID,
  plate: 'C482BTX',
  brand: 'Volvo',
  model: 'B8R',
  expenses: 2,
  total: 2300,
  categories: [
    { categoryId: CATEGORY_IDS.engine, categoryName: 'Motor', lines: 2, amount: 1500 },
    { categoryId: CATEGORY_IDS.tires, categoryName: 'Llantas', lines: 1, amount: 800 },
  ],
  ...over,
});

const unknownBus = row({
  busId: 'b2',
  plate: null,
  brand: null,
  model: null,
  expenses: 1,
  total: 450,
  categories: [{ categoryId: 'c3', categoryName: 'Frenos', lines: 1, amount: 450 }],
});

const answer = (
  items: BranchRepairExpenseRow[],
  { total = items.length, empty = false }: { total?: number; empty?: boolean } = {},
): BranchRepairExpensesPage => ({
  items,
  total,
  page: 1,
  pageSize: 20,
  summary: {
    totals: { buses: 4, expenses: 9, total: 5000.5 },
    groups: empty
      ? []
      : [
          { categoryId: CATEGORY_IDS.engine, categoryName: 'Motor', lines: 4, amount: 3000 },
          { categoryId: CATEGORY_IDS.tires, categoryName: 'Llantas', lines: 2, amount: 2000.5 },
        ],
  },
});

const exportPdf = jest.fn();
function setup({
  data = answer([row(), unknownBus]),
  address = '',
  error = false,
  pending = false,
  placeholder = false,
}: {
  data?: BranchRepairExpensesPage;
  address?: string;
  error?: boolean;
  pending?: boolean;
  placeholder?: boolean;
} = {}) {
  search = address;
  const refetch = jest.fn();
  jest.mocked(useBusesPage).mockReturnValue({
    data: busPage([bus({ id: BUS_ID, plate: 'C482BTX' })]),
  } as never);
  jest.mocked(useExpenseCategoriesPage).mockReturnValue({
    data: page([category(), category({ id: CATEGORY_IDS.tires, name: 'Llantas' })]),
  } as never);
  jest.mocked(useReport).mockReturnValue({
    data: error || pending ? undefined : data,
    isPending: pending,
    isError: error,
    isPlaceholderData: placeholder,
    refetch,
  } as never);
  jest.mocked(useReportPdf).mockReturnValue({ exportPdf, exporting: false });
  render(<RepairReport />);
  return { refetch };
}

const lastAddress = () => {
  const [url] = replace.mock.calls.at(-1) as [string];
  const [path, query = ''] = url.split('?');
  return { path, params: new URLSearchParams(query) };
};

beforeEach(() => {
  replace.mockReset();
  exportPdf.mockReset();
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

describe('RepairReport', () => {
  it('names the report and the branch and has a single primary button', () => {
    setup();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Gastos de taller por bus' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Quetzaltenango/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toHaveClass('bg-primary');
  });

  it('asks the report for the query of the address', () => {
    setup({
      address: `desde=2026-10-01&hasta=2026-10-13&bus=${BUS_ID}&categoria=${CATEGORY_IDS.engine}&pagina=2`,
    });

    const [path, params] = jest.mocked(useReport).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/branch-repair-expenses');
    expect(params.toString()).toBe(
      `busId=${BUS_ID}&categoryId=${CATEGORY_IDS.engine}&from=2026-10-01&page=2&pageSize=20&to=2026-10-13`,
    );
  });

  it('lists each bus with its expenses and its total, and names one it knows nothing about', () => {
    setup();

    const table = screen.getByRole('table', { name: 'Gastos de taller por bus' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Bus', 'Gastos', 'Total']);
    const first = within(screen.getByRole('row', { name: /C-482BTX/ }));
    expect(first.getByText('C-482BTX')).toHaveClass('font-mono');
    expect(first.getByText('Volvo B8R')).toBeInTheDocument();
    expect(first.getByText('2')).toBeInTheDocument();
    expect(first.getByText(money(2300))).toBeInTheDocument();
    const unknown = within(screen.getByRole('row', { name: /Bus sin datos/ }));
    expect(unknown.getByText(money(450))).toBeInTheDocument();
  });

  it('fits a phone without scrolling inside the card: no minimum width, the brand wraps under the plate', () => {
    setup();

    expect(screen.getByRole('table', { name: 'Gastos de taller por bus' })).toHaveStyle(
      'min-width: 0',
    );
    const first = within(screen.getByRole('row', { name: /C-482BTX/ }));
    expect(first.getByText('C-482BTX').parentElement).toHaveClass('flex-wrap');
    expect(first.getByText('Volvo B8R').parentElement).toBe(
      first.getByText('C-482BTX').parentElement,
    );
  });

  it('highlights the buses, the expenses and the total of the whole filter', () => {
    setup();

    const highlights = within(screen.getByRole('region', { name: 'Resumen del reporte' }));
    expect(highlights.getByText('Buses')).toBeInTheDocument();
    expect(highlights.getByText('Gastos')).toBeInTheDocument();
    expect(highlights.getByText('Total')).toBeInTheDocument();
    expect(highlights.getByText(money(5000.5))).toBeInTheDocument();
  });

  it('shows the spending by category as bars', () => {
    setup();
    const bars = within(
      screen.getByRole('heading', { name: 'Gasto por categoría' }).closest('section')!,
    );
    expect(bars.getByText('Motor')).toBeInTheDocument();
    expect(bars.getByText(money(3000))).toBeInTheDocument();
    expect(bars.getByText('Llantas')).toBeInTheDocument();
  });

  it('leaves the bars out when no category has spending', () => {
    setup({ data: answer([], { total: 0, empty: true }) });

    expect(screen.queryByRole('heading', { name: 'Gasto por categoría' })).not.toBeInTheDocument();
  });

  it('opens a bus to show its categories, with the lines and the subtotal of each', async () => {
    setup();
    const toggle = screen.getByRole('button', { name: /C-482BTX/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('region', { name: 'Categorías de C-482BTX' }),
    ).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const detail = within(screen.getByRole('region', { name: 'Categorías de C-482BTX' }));
    expect(detail.getByText('Motor')).toBeInTheDocument();
    expect(detail.getByText('2 líneas')).toBeInTheDocument();
    expect(detail.getByText(money(1500))).toBeInTheDocument();
    expect(detail.getByText('Llantas')).toBeInTheDocument();
    expect(detail.getByText('1 línea')).toBeInTheDocument();
    expect(detail.getByText(money(800))).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('region', { name: 'Categorías de C-482BTX' }),
    ).not.toBeInTheDocument();
  });

  it('opens a bus with the keyboard and turns the chevron without motion for who asked for none', async () => {
    setup();
    const toggle = screen.getByRole('button', { name: /C-482BTX/ });

    toggle.focus();
    await user.keyboard('{Enter}');

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const chevron = toggle.querySelector('svg')!;
    expect(chevron).toHaveClass('rotate-90');
    expect(chevron).toHaveClass('motion-reduce:transition-none');
  });

  it('opens each bus on its own', async () => {
    setup();

    await user.click(screen.getByRole('button', { name: /Bus sin datos/ }));

    expect(screen.getByRole('region', { name: 'Categorías de Bus sin datos' })).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Categorías de C-482BTX' }),
    ).not.toBeInTheDocument();
  });

  it('starts with every record, bus and category and writes the applied period in the address', async () => {
    setup({ address: 'pagina=3' });
    expect(screen.getByRole('button', { name: /Periodo/ })).toHaveTextContent(
      'Todos los registros',
    );
    expect(screen.getByRole('combobox', { name: 'Bus' })).toHaveTextContent('Todos los buses');
    expect(screen.getByRole('combobox', { name: 'Categoría' })).toHaveTextContent(
      'Todas las categorías',
    );

    await user.click(screen.getByRole('button', { name: /Periodo/ }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-13' } });
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    const { path, params } = lastAddress();
    expect(path).toBe('/sucursal/reportes/taller');
    expect(params.get('desde')).toBe('2026-10-01');
    expect(params.get('hasta')).toBe('2026-10-13');
    expect(params.has('pagina')).toBe(false);
  });

  it('writes the bus filter in the address and goes back to the first page', async () => {
    setup({ address: 'pagina=2' });

    await user.click(screen.getByRole('combobox', { name: 'Bus' }));
    await user.click(await screen.findByRole('option', { name: 'C-482BTX' }));

    const { params } = lastAddress();
    expect(params.get('bus')).toBe(BUS_ID);
    expect(params.has('pagina')).toBe(false);
  });

  it('writes the category filter in the address, and clears it with "all"', async () => {
    setup({ address: `categoria=${CATEGORY_IDS.tires}` });

    await user.click(screen.getByRole('combobox', { name: 'Categoría' }));
    await user.click(await screen.findByRole('option', { name: 'Motor' }));
    expect(lastAddress().params.get('categoria')).toBe(CATEGORY_IDS.engine);

    await user.click(screen.getByRole('combobox', { name: 'Categoría' }));
    await user.click(await screen.findByRole('option', { name: 'Todas las categorías' }));
    expect(lastAddress().params.has('categoria')).toBe(false);
  });

  it('asks for the lists of the selects with every bus and category, active or not', () => {
    setup();

    expect(useBusesPage).toHaveBeenCalledWith(expect.objectContaining({ status: 'all' }));
    expect(useExpenseCategoriesPage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'all' }),
    );
  });

  it('clears the period, the bus and the category together', async () => {
    setup({
      address: `desde=2026-10-01&bus=${BUS_ID}&categoria=${CATEGORY_IDS.engine}&pagina=2`,
    });

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(lastAddress().params.toString()).toBe('');
  });

  it('offers no clearing when nothing narrows the report', () => {
    setup();

    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it('exports with the same filters the table has', async () => {
    setup({ address: `desde=2026-10-01&bus=${BUS_ID}` });

    await user.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    expect(exportPdf).toHaveBeenCalledTimes(1);
    const [path, params, stem] = jest.mocked(useReportPdf).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/branch-repair-expenses');
    expect(params.get('from')).toBe('2026-10-01');
    expect(params.get('busId')).toBe(BUS_ID);
    expect(stem).toBe('reporte-taller');
  });

  it('explains an empty report under filters', () => {
    setup({ data: answer([], { total: 0, empty: true }), address: `bus=${BUS_ID}` });
    expect(screen.getByText('No hay gastos de taller con esos filtros.')).toBeInTheDocument();
  });

  it('explains a branch without repair expenses', () => {
    setup({ data: answer([], { total: 0, empty: true }) });
    expect(screen.getByText('Aún no hay gastos de taller en tu sucursal.')).toBeInTheDocument();
  });

  it('shows the skeleton while it loads', () => {
    setup({ pending: true });

    expect(screen.getAllByLabelText('Cargando').length).toBeGreaterThan(0);
  });

  it('dims the table while the next page arrives', () => {
    setup({ placeholder: true });

    expect(
      screen.getByRole('table', { name: 'Gastos de taller por bus' }).closest('section'),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('says it could not load the report and tries again on request', async () => {
    const { refetch } = setup({ error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el reporte.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });
});
