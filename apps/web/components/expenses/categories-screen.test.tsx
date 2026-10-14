import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import {
  useDeleteExpenseCategory,
  useExpenseCategoriesPage,
  useSaveExpenseCategory,
} from '../../hooks/use-expense-categories';
import { category, page } from '../../test-support/expenses';
import { CategoriesScreen } from './categories-screen';
import { DEBOUNCE_MS, startFakeClock } from '../../test-support/fake-clock';

jest.mock('../../hooks/use-expense-categories');
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('./category-dialog', () => ({
  CategoryDialog: ({
    open,
    category: editing,
  }: {
    open: boolean;
    category: { name: string } | null;
  }) =>
    open ? (
      <div role="dialog" aria-label={editing ? `Renombrar ${editing.name}` : 'Nueva categoría'} />
    ) : null,
}));
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/admin/categorias',
  useSearchParams: () => new URLSearchParams(search),
}));

const categories = [
  category({ id: 'c1', name: 'Motor', inUse: true }),
  category({ id: 'c2', name: 'Turbo', inUse: false }),
  category({ id: 'c3', name: 'Llantas', active: false, inUse: false }),
];

function setup({
  error = false,
  items = categories,
  total = items.length,
  address = '',
  remove = jest.fn().mockResolvedValue(undefined),
}: {
  error?: boolean;
  items?: unknown[];
  total?: number;
  address?: string;
  remove?: jest.Mock;
} = {}) {
  search = address;
  const refetch = jest.fn();
  const save = jest.fn().mockResolvedValue(category());
  jest.mocked(useExpenseCategoriesPage).mockReturnValue(
    (error
      ? { data: undefined, isPending: false, isError: true, isPlaceholderData: false, refetch }
      : {
          data: page(items, { total }),
          isPending: false,
          isError: false,
          isPlaceholderData: false,
          refetch,
        }) as never,
  );
  jest.mocked(useSaveExpenseCategory).mockReturnValue({ mutateAsync: save } as never);
  jest.mocked(useDeleteExpenseCategory).mockReturnValue({ mutateAsync: remove } as never);
  render(<CategoriesScreen />);
  return { refetch, save, remove };
}

const lastAddress = () => {
  const [url] = replace.mock.calls.at(-1) as [string];
  const [path, query = ''] = url.split('?');
  return { path, params: new URLSearchParams(query) };
};
const openActions = (name: string) =>
  userEvent.click(screen.getByRole('button', { name: `Acciones de ${name}` }));

beforeEach(() => {
  replace.mockReset();
  jest.mocked(toast.success).mockReset();
});
afterEach(() => jest.useRealTimers());

describe('CategoriesScreen', () => {
  it('names the screen and has a single primary action that opens the dialog', async () => {
    setup();

    expect(screen.getByText('Administración')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Categorías de gasto' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nueva categoría' }));

    expect(screen.getByRole('dialog', { name: 'Nueva categoría' })).toBeInTheDocument();
  });

  it('starts on the active tab and offers the inactive one', () => {
    setup();

    expect(useExpenseCategoriesPage).toHaveBeenCalledWith({
      status: 'active',
      page: 1,
      pageSize: 20,
    });
    expect(screen.getByRole('tab', { name: 'Activas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Inactivas' })).toBeInTheDocument();
  });

  it('asks for what the address carries', () => {
    setup({ address: 'estado=inactivas&buscar=motor&pagina=2' });

    expect(useExpenseCategoriesPage).toHaveBeenCalledWith({
      status: 'inactive',
      q: 'motor',
      page: 2,
      pageSize: 20,
    });
    expect(screen.getByRole('tab', { name: 'Inactivas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'Buscar categoría' })).toHaveValue('motor');
  });

  it('writes the tab in the address and goes back to the first page', async () => {
    setup({ address: 'pagina=2' });

    await userEvent.click(screen.getByRole('tab', { name: 'Inactivas' }));

    const { path, params } = lastAddress();
    expect(path).toBe('/admin/categorias');
    expect(params.get('estado')).toBe('inactivas');
    expect(params.has('pagina')).toBe(false);
  });

  it('writes the search in the address 300 ms after the last key', async () => {
    const clock = startFakeClock();
    setup();

    await clock.type(screen.getByRole('textbox', { name: 'Buscar categoría' }), 'motor');
    await clock.elapse(DEBOUNCE_MS);

    expect(lastAddress().params.get('buscar')).toBe('motor');
  });

  it('pages in the address and counts the categories', async () => {
    setup({ total: 45, address: 'pagina=2' });

    expect(screen.getByText(/de 45/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

    expect(lastAddress().params.get('pagina')).toBe('3');
  });

  it('shows the name, whether it has expenses and its state', () => {
    setup();

    expect(screen.getByRole('row', { name: /Motor/ })).toHaveTextContent('Con gastos');
    expect(screen.getByRole('row', { name: /Motor/ })).toHaveTextContent('Activa');
    expect(screen.getByRole('row', { name: /Turbo/ })).toHaveTextContent('Sin gastos');
    expect(screen.getByRole('row', { name: /Llantas/ })).toHaveTextContent('Inactiva');
  });

  it('opens the rename dialog with the category', async () => {
    setup();

    await openActions('Motor');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Renombrar' }));

    expect(screen.getByRole('dialog', { name: 'Renombrar Motor' })).toBeInTheDocument();
  });

  it('offers to delete only a category that has no expenses', async () => {
    setup();

    await openActions('Motor');
    expect(screen.queryByRole('menuitem', { name: 'Eliminar' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Desactivar' })).toBeInTheDocument();
  });

  it('offers to reactivate an inactive category instead of deactivating it', async () => {
    setup();

    await openActions('Llantas');

    expect(screen.getByRole('menuitem', { name: 'Reactivar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Desactivar' })).not.toBeInTheDocument();
  });

  it('deactivates after a confirmation', async () => {
    const { save } = setup();

    await openActions('Motor');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Desactivar' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('¿Desactivar Motor?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));

    expect(save).toHaveBeenCalledWith({ id: 'c1', request: { active: false } });
    expect(toast.success).toHaveBeenCalledWith('Desactivamos la categoría Motor.');
  });

  it('reactivates after a confirmation', async () => {
    const { save } = setup();

    await openActions('Llantas');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reactivar' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reactivar' }));

    expect(save).toHaveBeenCalledWith({ id: 'c3', request: { active: true } });
    expect(toast.success).toHaveBeenCalledWith('Reactivamos la categoría Llantas.');
  });

  it('deletes after a confirmation', async () => {
    const { remove } = setup();

    await openActions('Turbo');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('¿Eliminar la categoría Turbo?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(remove).toHaveBeenCalledWith('c2');
    expect(toast.success).toHaveBeenCalledWith('Eliminamos la categoría Turbo.');
  });

  it('tells why a category cannot be deleted when the service refuses', async () => {
    setup({
      remove: jest
        .fn()
        .mockRejectedValue(
          new ApiError(409, 'Esta categoría ya tiene gastos. Desactívala para que no se use más.'),
        ),
    });

    await openActions('Turbo');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Esta categoría ya tiene gastos. Desactívala para que no se use más.',
    );
  });

  it('invites to create the first category when there is none', () => {
    setup({ items: [], total: 0 });

    expect(
      screen.getByText('Aún no hay categorías. Crea la primera con «Nueva categoría».'),
    ).toBeInTheDocument();
  });

  it('says so when the filters find none', () => {
    setup({ items: [], total: 0, address: 'estado=inactivas' });

    expect(screen.getByText('No hay categorías con esos filtros.')).toBeInTheDocument();
  });

  it('shows a friendly error with a retry', async () => {
    const { refetch } = setup({ error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar las categorías.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });
});
