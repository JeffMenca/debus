import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { useBranchOptions } from '../../hooks/use-branches';
import { useOwnBranch } from '../../hooks/use-own-branch';
import { useDeleteRoute, useRoutesPage, useSaveRoute } from '../../hooks/use-routes';
import { route, routePage } from '../../test-support/fleet';
import { RouteDialog } from './route-dialog';
import { RoutesScreen } from './routes-screen';
import { DEBOUNCE_MS, startFakeClock } from '../../test-support/fake-clock';

jest.mock('../../hooks/use-branches');
jest.mock('../../hooks/use-own-branch');
jest.mock('../../hooks/use-routes');
jest.mock('./route-dialog', () => ({
  RouteDialog: jest.fn(jest.requireActual('./route-dialog').RouteDialog),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/rutas',
  useSearchParams: () => new URLSearchParams(search),
}));

const routes = [
  route({ id: 'r1' }),
  route({
    id: 'r2',
    destinationName: 'Flores',
    distanceKm: 560,
    ticketPrice: 150,
    hasTrips: true,
  }),
  route({ id: 'r3', destinationName: 'Cobán', active: false }),
];

function setup({
  error = false,
  items = routes,
  address = '',
  total = items.length,
  save = jest.fn().mockResolvedValue(route()),
  remove = jest.fn().mockResolvedValue(undefined),
}: {
  error?: boolean;
  items?: unknown[];
  address?: string;
  total?: number;
  save?: jest.Mock;
  remove?: jest.Mock;
} = {}) {
  search = address;
  const refetch = jest.fn();
  jest.mocked(useRoutesPage).mockReturnValue(
    (error
      ? { data: undefined, isPending: false, isError: true, isPlaceholderData: false, refetch }
      : {
          data: routePage(items as never, { total }),
          isPending: false,
          isError: false,
          isPlaceholderData: false,
          refetch,
        }) as never,
  );
  jest.mocked(useSaveRoute).mockReturnValue({ mutateAsync: save } as never);
  jest.mocked(useDeleteRoute).mockReturnValue({ mutateAsync: remove } as never);
  jest.mocked(useBranchOptions).mockReturnValue({ data: [] } as never);
  jest.mocked(useOwnBranch).mockReturnValue({ id: 'br', name: 'Quetzaltenango' } as never);
  render(<RoutesScreen />);
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
  jest.mocked(toast.error).mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('RoutesScreen', () => {
  it('names the branch and has a single primary action', () => {
    setup();

    expect(screen.getByText('Flota · Quetzaltenango')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Rutas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nueva ruta' })).toBeInTheDocument();
  });

  it('lists each route with distance, price and state', () => {
    setup();

    const guatemala = screen.getByRole('row', { name: /Guatemala/ });
    expect(guatemala).toHaveTextContent('Quetzaltenango');
    expect(guatemala).toHaveTextContent('206.5 km');
    expect(guatemala).toHaveTextContent(/Q\s?85\.00/);
    expect(guatemala).toHaveTextContent('Activa');
    expect(screen.getByRole('row', { name: /Cobán/ })).toHaveTextContent('Retirada');
  });

  it('animates the line of each route only when motion is allowed', () => {
    setup();

    const line = document.querySelector('line.animate-route-sm');
    expect(line).toHaveClass('motion-reduce:animate-none');
  });

  it('starts on the active tab with the counts of the whole filter', () => {
    setup();

    expect(useRoutesPage).toHaveBeenCalledWith({ status: 'active', page: 1, pageSize: 20 });
    expect(screen.getByRole('tab', { name: /Activas/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Activas/ })).toHaveTextContent('4');
    expect(screen.getByRole('tab', { name: /Retiradas/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /Todas/ })).toHaveTextContent('5');
  });

  it('asks for what the address carries', () => {
    setup({ address: 'estado=todas&buscar=flo&pagina=2&mostrar=50' });

    expect(useRoutesPage).toHaveBeenCalledWith({ status: 'all', q: 'flo', page: 2, pageSize: 50 });
    expect(screen.getByRole('textbox', { name: 'Buscar destino' })).toHaveValue('flo');
  });

  it('changes the tab in the address and goes back to the first page', async () => {
    setup({ address: 'pagina=2' });

    await userEvent.click(screen.getByRole('tab', { name: /Retiradas/ }));

    const { path, params } = lastAddress();
    expect(path).toBe('/sucursal/rutas');
    expect(params.get('estado')).toBe('retiradas');
    expect(params.has('pagina')).toBe(false);
  });

  it('searches 300 ms after the last key', async () => {
    const clock = startFakeClock();
    setup();

    await clock.type(screen.getByRole('textbox', { name: 'Buscar destino' }), 'flo');
    clock.elapse(DEBOUNCE_MS - 1);
    expect(replace).not.toHaveBeenCalled();

    clock.elapse(1);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(lastAddress().params.get('buscar')).toBe('flo');
  });

  it('pages in the address', async () => {
    setup({ total: 45, address: 'pagina=2' });

    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

    expect(lastAddress().params.get('pagina')).toBe('3');
  });

  it('says so when there are no routes and when a filter finds none', () => {
    setup({ items: [], total: 0 });
    expect(
      screen.getByText('Aún no hay rutas. Crea la primera con «Nueva ruta».'),
    ).toBeInTheDocument();
  });

  it('says so when a filter finds none', () => {
    setup({ items: [], total: 0, address: 'buscar=zzz' });

    expect(screen.getByText('No hay rutas con esos filtros.')).toBeInTheDocument();
  });

  it('shows a friendly error with a retry', async () => {
    const { refetch } = setup({ error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar las rutas.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });

  it('retires a route keeping its distance and price', async () => {
    const { save } = setup();

    await openActions('Quetzaltenango a Guatemala');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Retirar' }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        id: 'r1',
        input: { distanceKm: 206.5, ticketPrice: 85, active: false },
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Retiramos la ruta a Guatemala.');
  });

  it('puts a retired route back', async () => {
    const { save } = setup();

    await openActions('Quetzaltenango a Cobán');
    expect(screen.queryByRole('menuitem', { name: 'Retirar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reactivar' }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].input.active).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('Reactivamos la ruta a Cobán.');
  });

  it('tells when retiring fails', async () => {
    setup({ save: jest.fn().mockRejectedValue(new ApiError(0, 'Sin conexión.')) });

    await openActions('Quetzaltenango a Guatemala');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Retirar' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Sin conexión.'));
  });

  it('asks before deleting a route that never had trips and then does it', async () => {
    const { remove } = setup();

    await openActions('Quetzaltenango a Guatemala');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('¿Eliminar la ruta a Guatemala?');
    expect(dialog).toHaveTextContent('No se puede deshacer.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith('r1'));
    expect(toast.success).toHaveBeenCalledWith('Eliminamos la ruta a Guatemala.');
  });

  it('shows the reason in the dialog when the service refuses to delete', async () => {
    setup({
      remove: jest
        .fn()
        .mockRejectedValue(
          new ApiError(
            409,
            'Esta ruta ya tiene viajes. Puedes retirarla para que no se programen más.',
          ),
        ),
    });

    await openActions('Quetzaltenango a Guatemala');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Esta ruta ya tiene viajes.');
  });

  it('does not offer to delete a route with trips and explains why', async () => {
    setup();

    await openActions('Quetzaltenango a Flores');
    expect(screen.queryByRole('menuitem', { name: 'Eliminar' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Retirar' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await userEvent.hover(screen.getByRole('button', { name: 'Tiene viajes: puedes retirarla' }));
    expect(await screen.findAllByText('Tiene viajes: puedes retirarla')).not.toHaveLength(0);
  });

  it('opens the dialog from the primary action and from Editar', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Nueva ruta' }));
    expect(screen.getByRole('dialog', { name: 'Nueva ruta' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await openActions('Quetzaltenango a Guatemala');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));
    expect(screen.getByRole('dialog', { name: 'Editar ruta a Guatemala' })).toBeInTheDocument();
  });

  it('keeps the edited route in the dialog while it closes', async () => {
    setup();
    await openActions('Quetzaltenango a Guatemala');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));

    await userEvent.keyboard('{Escape}');

    // The dialog animates out after `open` flips, so it must still hold the route it was editing.
    expect(jest.mocked(RouteDialog).mock.lastCall?.[0]).toMatchObject({
      open: false,
      route: { destinationName: 'Guatemala' },
    });
  });
});
