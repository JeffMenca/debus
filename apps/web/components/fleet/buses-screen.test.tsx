import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { bus, busPage } from '../../test-support/fleet';
import {
  useBusCounts,
  useBusesPage,
  useSaveBus,
  useSetBusActive,
  useUploadBusPhoto,
} from '../../hooks/use-buses';
import { useDriverOptions } from '../../hooks/use-drivers';
import { useOwnBranch } from '../../hooks/use-own-branch';
import { BusSheet } from './bus-sheet';
import { BusesScreen } from './buses-screen';
import { DEBOUNCE_MS, startFakeClock } from '../../test-support/fake-clock';

jest.mock('../../hooks/use-buses');
jest.mock('../../hooks/use-drivers');
jest.mock('../../hooks/use-own-branch');
jest.mock('../../hooks/use-photo', () => ({ usePhoto: () => null }));
jest.mock('./bus-sheet', () => ({
  BusSheet: jest.fn(jest.requireActual('./bus-sheet').BusSheet),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/buses',
  useSearchParams: () => new URLSearchParams(search),
}));

const buses = [
  bus({
    id: 'b1',
    displayStatus: 'IN_TRANSIT',
    assignedDriverId: 'd1',
    assignedDriverName: 'Julio Pérez',
  }),
  bus({ id: 'b2', plate: 'C731PLR', brand: 'Scania', model: 'K360', year: 2022, capacity: 44 }),
  bus({
    id: 'b3',
    plate: 'C340RTE',
    operationalStatus: 'IN_WORKSHOP',
    displayStatus: 'IN_WORKSHOP',
    mileageKm: 312580,
  }),
  bus({ id: 'b4', plate: 'C055DFG', active: false, displayStatus: 'INACTIVE' }),
];

function setup({
  error = false,
  items = buses,
  address = '',
  refreshing = false,
  total = items.length,
  fleetCounts = { IN_TRANSIT: 2, AVAILABLE: 3, IN_WORKSHOP: 1, INACTIVE: 1 },
  pageCounts,
  save = jest.fn().mockResolvedValue(bus()),
  setActive = jest.fn().mockResolvedValue(undefined),
}: {
  error?: boolean;
  items?: unknown[];
  address?: string;
  refreshing?: boolean;
  total?: number;
  // The counts of the whole fleet, which feed the cards.
  fleetCounts?: Record<string, number>;
  // The counts the page carries, which follow the search and feed the tabs.
  pageCounts?: Record<string, number>;
  save?: jest.Mock;
  setActive?: jest.Mock;
} = {}) {
  search = address;
  const refetch = jest.fn();
  jest.mocked(useBusesPage).mockReturnValue(
    (error
      ? { data: undefined, isPending: false, isError: true, isPlaceholderData: false, refetch }
      : {
          data: busPage(
            items as never,
            pageCounts ? { total, summary: { statusCounts: pageCounts } } : { total },
          ),
          isPending: false,
          isError: false,
          isPlaceholderData: refreshing,
          refetch,
        }) as never,
  );
  jest.mocked(useBusCounts).mockReturnValue({ data: fleetCounts } as never);
  jest.mocked(useSaveBus).mockReturnValue({ mutateAsync: save } as never);
  jest.mocked(useSetBusActive).mockReturnValue({ mutateAsync: setActive } as never);
  jest.mocked(useUploadBusPhoto).mockReturnValue({ mutateAsync: jest.fn() } as never);
  jest.mocked(useDriverOptions).mockReturnValue({ data: undefined } as never);
  jest.mocked(useOwnBranch).mockReturnValue({ id: 'br', name: 'Quetzaltenango' } as never);
  render(<BusesScreen />);
  return { refetch, save, setActive };
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
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('BusesScreen', () => {
  it('names the branch and has a single primary action', () => {
    setup();

    expect(screen.getByText('Flota · Quetzaltenango')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Buses' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar bus' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Exportar/ })).not.toBeInTheDocument();
  });

  it('shows how many buses are in each state, from the whole fleet', () => {
    setup();

    const cards = screen.getByRole('region', { name: 'Resumen de la flota' });
    expect(within(cards).getByText('2')).toBeInTheDocument();
    expect(within(cards).getByText('En camino')).toBeInTheDocument();
    expect(within(cards).getByText('3')).toBeInTheDocument();
    expect(within(cards).getByText('Disponibles')).toBeInTheDocument();
    expect(within(cards).getByText('En taller')).toBeInTheDocument();
    expect(within(cards).getByText('Inactivos')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Todos/ })).toHaveTextContent('7');
    expect(screen.getByRole('tab', { name: /En camino/ })).toHaveTextContent('2');
  });

  it('keeps the cards on the whole fleet while a search narrows the tabs', () => {
    setup({
      address: 'q=volvo',
      pageCounts: { IN_TRANSIT: 1, AVAILABLE: 0, IN_WORKSHOP: 0, INACTIVE: 0 },
    });

    const cards = screen.getByRole('region', { name: 'Resumen de la flota' });
    expect(within(cards).getByText('2')).toBeInTheDocument();
    expect(within(cards).getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Todos/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /Disponibles/ })).toHaveTextContent('0');
  });

  it('lists each bus with plate, seats, driver, kilometres, trips and state', () => {
    setup();

    const row = screen.getByRole('row', { name: /C-482BTX/ });
    expect(row).toHaveTextContent('Volvo B8R');
    expect(row).toHaveTextContent('2021');
    expect(row).toHaveTextContent('40');
    expect(row).toHaveTextContent('Julio Pérez');
    expect(row).toHaveTextContent('148,410');
    expect(row).toHaveTextContent('612');
    expect(row).toHaveTextContent('En camino');
    expect(screen.getByRole('row', { name: /C-731PLR/ })).toHaveTextContent('Sin asignar');
    expect(screen.getByRole('row', { name: /C-731PLR/ })).toHaveTextContent('Disponible');
    expect(screen.getByRole('row', { name: /C-340RTE/ })).toHaveTextContent('En taller');
    expect(screen.getByRole('row', { name: /C-055DFG/ })).toHaveTextContent('Inactivo');
    expect(screen.getByText('Mostrando 1–4 de 4')).toBeInTheDocument();
    expect(
      screen.getByText('Un bus solo se desactiva si no tiene viajes programados ni en camino.'),
    ).toBeInTheDocument();
  });

  it('asks for what the address carries', () => {
    setup({ address: 'estado=en-taller&buscar=volvo&pagina=2&mostrar=50' });

    expect(useBusesPage).toHaveBeenCalledWith({
      status: 'IN_WORKSHOP',
      q: 'volvo',
      page: 2,
      pageSize: 50,
    });
    expect(screen.getByRole('tab', { name: /En taller/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'Buscar bus' })).toHaveValue('volvo');
  });

  it('changes the tab by writing it in the address and goes back to the first page', async () => {
    setup({ address: 'pagina=2' });

    await userEvent.click(screen.getByRole('tab', { name: /En taller/ }));

    const { path, params } = lastAddress();
    expect(path).toBe('/sucursal/buses');
    expect(params.get('estado')).toBe('en-taller');
    expect(params.has('pagina')).toBe(false);
  });

  it('searches 300 ms after the last key and says what the box is for', async () => {
    const clock = startFakeClock();
    setup();
    const box = screen.getByRole('textbox', { name: 'Buscar bus' });
    expect(box).toHaveAttribute('placeholder', 'Buscar placa, marca o modelo');

    await clock.type(box, 'volvo');
    clock.elapse(DEBOUNCE_MS - 1);
    expect(replace).not.toHaveBeenCalled();

    clock.elapse(1);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(lastAddress().params.get('buscar')).toBe('volvo');
  });

  it('pages in the address', async () => {
    setup({ total: 45, address: 'pagina=2' });

    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

    expect(lastAddress().params.get('pagina')).toBe('3');
  });

  it('says so when the fleet is empty and when a filter finds nothing', () => {
    setup({ items: [], total: 0 });
    expect(
      screen.getByText('Aún no hay buses. Registra el primero con «Registrar bus».'),
    ).toBeInTheDocument();
  });

  it('says so when a filter finds nothing', () => {
    setup({ items: [], total: 0, address: 'buscar=zzz' });

    expect(screen.getByText('No hay buses con esos filtros.')).toBeInTheDocument();
  });

  it('shows a friendly error with a retry', async () => {
    const { refetch } = setup({ error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los buses.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });

  it('sends a bus to the workshop with the rest of its data unchanged', async () => {
    const { save } = setup();

    await openActions('C-731PLR');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mandar a taller' }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        id: 'b2',
        fields: {
          plate: 'C731PLR',
          brand: 'Scania',
          model: 'K360',
          year: 2022,
          capacity: 44,
          mileageKm: 148410,
          operationalStatus: 'IN_WORKSHOP',
          assignedDriverId: null,
        },
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('El bus C-731PLR está en taller.');
  });

  it('puts a bus back in service from the workshop', async () => {
    const { save } = setup();

    await openActions('C-340RTE');
    expect(screen.queryByRole('menuitem', { name: 'Mandar a taller' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Volver a servicio' }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].fields.operationalStatus).toBe('AVAILABLE');
    expect(toast.success).toHaveBeenCalledWith('El bus C-340RTE volvió a servicio.');
  });

  it('tells when the workshop change fails', async () => {
    setup({ save: jest.fn().mockRejectedValue(new ApiError(0, 'Sin conexión.')) });

    await openActions('C-731PLR');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mandar a taller' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Sin conexión.'));
  });

  it('does not offer the workshop for an inactive bus', async () => {
    setup();

    await openActions('C-055DFG');

    expect(screen.queryByRole('menuitem', { name: 'Mandar a taller' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Desactivar' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Reactivar' })).toBeInTheDocument();
  });

  it('asks before deactivating and then does it', async () => {
    const { setActive } = setup();

    await openActions('C-731PLR');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Desactivar' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('¿Desactivar C-731PLR?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ id: 'b2', active: false }));
    expect(toast.success).toHaveBeenCalledWith('Desactivamos el bus C-731PLR.');
  });

  it('shows the reason in the dialog when the bus has trips', async () => {
    setup({
      setActive: jest
        .fn()
        .mockRejectedValue(
          new ApiError(
            409,
            'Este bus tiene viajes programados o en camino. Podrás desactivarlo cuando terminen o se eliminen.',
          ),
        ),
    });

    await openActions('C-482BTX');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Desactivar' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este bus tiene viajes programados o en camino.',
    );
  });

  it('reactivates an inactive bus after confirming', async () => {
    const { setActive } = setup();

    await openActions('C-055DFG');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reactivar' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reactivar' }),
    );

    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ id: 'b4', active: true }));
  });

  it('opens the form from the primary action and from Editar', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Registrar bus' }));
    expect(screen.getByRole('dialog', { name: 'Registrar bus' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await openActions('C-482BTX');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));
    expect(screen.getByRole('dialog', { name: 'Editar bus C-482BTX' })).toBeInTheDocument();
  });

  it('keeps the edited bus in the panel while it closes', async () => {
    setup();
    await openActions('C-482BTX');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));

    await userEvent.keyboard('{Escape}');

    // The panel animates out after `open` flips, so it must still hold the bus it was editing.
    expect(jest.mocked(BusSheet).mock.lastCall?.[0]).toMatchObject({
      open: false,
      bus: { id: 'b1' },
    });
  });
});
