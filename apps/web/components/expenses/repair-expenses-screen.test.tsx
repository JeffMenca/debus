import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useBusesPage } from '../../hooks/use-buses';
import { useExpenseCategoriesPage } from '../../hooks/use-expense-categories';
import { useRepairExpensesPage } from '../../hooks/use-repair-expenses';
import { CATEGORY_IDS, category, page, repairExpense } from '../../test-support/expenses';
import { bus, busPage } from '../../test-support/fleet';
import { DEBOUNCE_MS, startFakeClock } from '../../test-support/fake-clock';
import { RepairExpensesScreen } from './repair-expenses-screen';

jest.mock('../../hooks/use-buses');
jest.mock('../../hooks/use-expense-categories');
jest.mock('../../hooks/use-repair-expenses');
jest.mock('../../hooks/use-own-branch', () => ({
  useOwnBranch: () => ({ id: 'br', name: 'Quetzaltenango' }),
}));
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/gastos',
  useSearchParams: () => new URLSearchParams(search),
}));

const user = userEvent.setup({ applyAccept: false });
const BUS_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const expenses = [
  repairExpense({ id: 'e1' }),
  repairExpense({
    id: 'e2',
    busPlate: 'C731PLR',
    serviceDate: '2026-10-18',
    total: 350.5,
    laborTotal: 350.5,
    partsTotal: 0,
    lines: [
      {
        categoryId: CATEGORY_IDS.engine,
        categoryName: 'Motor',
        kind: 'LABOR',
        description: '',
        amount: 350.5,
      },
    ],
  }),
];

function setup({
  items = expenses,
  total = items.length,
  sum = 5550.5,
  address = '',
  error = false,
}: { items?: unknown[]; total?: number; sum?: number; address?: string; error?: boolean } = {}) {
  search = address;
  const refetch = jest.fn();
  jest.mocked(useBusesPage).mockReturnValue({
    data: busPage([bus({ id: BUS_ID, plate: 'C482BTX' })]),
  } as never);
  jest.mocked(useExpenseCategoriesPage).mockReturnValue({
    data: page([category(), category({ id: CATEGORY_IDS.tires, name: 'Llantas' })]),
  } as never);
  jest.mocked(useRepairExpensesPage).mockReturnValue(
    (error
      ? { data: undefined, isPending: false, isError: true, isPlaceholderData: false, refetch }
      : {
          data: page(items, { total, summary: { total: sum } }),
          isPending: false,
          isError: false,
          isPlaceholderData: false,
          refetch,
        }) as never,
  );
  render(<RepairExpensesScreen />);
  return { refetch };
}

const lastAddress = () => {
  const [url] = replace.mock.calls.at(-1) as [string];
  const [path, query = ''] = url.split('?');
  return { path, params: new URLSearchParams(query) };
};

beforeEach(() => {
  replace.mockReset();
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});
afterEach(() => jest.useRealTimers());

describe('RepairExpensesScreen', () => {
  it('names the screen and the branch and has a single primary action to register one', () => {
    setup();

    expect(screen.getByText('Finanzas · Quetzaltenango')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Gastos de taller' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar gasto' })).toHaveAttribute(
      'href',
      '/sucursal/gastos/nuevo',
    );
  });

  it('starts with every bus, category and date', () => {
    setup();

    expect(useRepairExpensesPage).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(screen.getByLabelText('Desde')).toHaveValue('');
    expect(screen.getByLabelText('Hasta')).toHaveValue('');
    expect(screen.getAllByText('Todas las fechas')).toHaveLength(2);
    expect(screen.getByRole('combobox', { name: 'Bus' })).toHaveTextContent('Todos los buses');
    expect(screen.getByRole('combobox', { name: 'Categoría' })).toHaveTextContent(
      'Todas las categorías',
    );
  });

  it('asks for every filter the address carries', () => {
    setup({
      address: `bus=${BUS_ID}&categoria=${CATEGORY_IDS.engine}&desde=2026-10-01&hasta=2026-10-31&buscar=bomba&pagina=2`,
    });

    expect(useRepairExpensesPage).toHaveBeenCalledWith({
      busId: BUS_ID,
      categoryId: CATEGORY_IDS.engine,
      from: '2026-10-01',
      to: '2026-10-31',
      q: 'bomba',
      page: 2,
      pageSize: 20,
    });
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-10-31');
    expect(screen.getByRole('combobox', { name: 'Bus' })).toHaveTextContent('C-482BTX');
    expect(screen.getByRole('textbox', { name: 'Buscar gasto' })).toHaveValue('bomba');
  });

  it('writes the bus filter in the address and goes back to the first page', async () => {
    setup({ address: 'pagina=2' });

    await user.click(screen.getByRole('combobox', { name: 'Bus' }));
    await user.click(await screen.findByRole('option', { name: 'C-482BTX' }));

    const { path, params } = lastAddress();
    expect(path).toBe('/sucursal/gastos');
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

  it('writes the range of dates in the address and keeps the two from crossing', () => {
    setup({ address: 'desde=2026-10-01&hasta=2026-10-31' });

    expect(screen.getByLabelText('Desde')).toHaveAttribute('max', '2026-10-31');
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('min', '2026-10-01');
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-05' } });
    expect(lastAddress().params.get('desde')).toBe('2026-10-05');
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '' } });
    expect(lastAddress().params.has('hasta')).toBe(false);
  });

  it('writes the search in the address 300 ms after the last key', async () => {
    const clock = startFakeClock();
    setup();

    await clock.type(screen.getByRole('textbox', { name: 'Buscar gasto' }), 'bomba');
    await clock.elapse(DEBOUNCE_MS);

    expect(lastAddress().params.get('buscar')).toBe('bomba');
  });

  it('shows the total of the whole filter, not of the page', () => {
    setup({ total: 45, sum: 98765.4 });

    const total = screen.getByText('Total del filtro').parentElement;
    expect(total).toHaveTextContent(/Q\s?98,765\.40/);
  });

  it('lists the date, bus, categories and amounts of each expense', () => {
    setup();

    const first = screen.getByRole('row', { name: /C-482BTX/ });
    expect(first).toHaveTextContent('20 oct 2026');
    expect(first).toHaveTextContent('Motor, Llantas');
    expect(first).toHaveTextContent(/Q\s?1,200\.00/);
    expect(first).toHaveTextContent(/Q\s?4,000\.00/);
    expect(first).toHaveTextContent(/Q\s?5,200\.00/);
    expect(screen.getByRole('row', { name: /C-731PLR/ })).toHaveTextContent('Motor');
  });

  it('opens the lines of an expense', async () => {
    setup();

    await user.click(screen.getByRole('button', { name: 'Ver detalle del gasto de C-482BTX' }));

    const dialog = await screen.findByRole('dialog', { name: /C-482BTX/ });
    expect(dialog).toHaveTextContent('Cambio de bomba');
    expect(dialog).toHaveTextContent('Dos llantas traseras');
    expect(within(dialog).getAllByText('Mano de obra').length).toBeGreaterThan(0);
  });

  it('pages in the address and counts the expenses', async () => {
    setup({ total: 45, address: 'pagina=2' });

    expect(screen.getByText(/de 45/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));

    expect(lastAddress().params.get('pagina')).toBe('3');
  });

  it('invites to register the first expense when there is none', () => {
    setup({ items: [], total: 0, sum: 0 });

    expect(screen.getByText('Aún no hay gastos de taller registrados.')).toBeInTheDocument();
  });

  it('says so when the filters find none', () => {
    setup({ items: [], total: 0, sum: 0, address: 'buscar=zzz' });

    expect(screen.getByText('No hay gastos con esos filtros.')).toBeInTheDocument();
  });

  it('shows a friendly error with a retry', async () => {
    const { refetch } = setup({ error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los gastos.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });
});
