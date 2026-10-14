import { todayInGuatemala } from '@debus/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useOwnBranch } from '../../hooks/use-own-branch';
import { useRentalRequestsPage } from '../../hooks/use-rental-requests';
import { useTripsPage } from '../../hooks/use-trips';
import { trip, tripPage } from '../../test-support/trips';
import { TripsScreen } from './trips-screen';

jest.mock('../../hooks/use-own-branch');
jest.mock('../../hooks/use-trips');
jest.mock('../../hooks/use-rental-requests');
jest.mock('./rental-requests-tab', () => ({
  RentalRequestsTab: () => <p>alquileres por asignar</p>,
}));
jest.mock('./schedule-trip-dialog', () => ({
  ScheduleTripDialog: ({ open, defaultDay }: { open: boolean; defaultDay: string }) =>
    open ? <div role="dialog" aria-label="Programar viaje" data-day={defaultDay} /> : null,
}));
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/viajes',
  useSearchParams: () => new URLSearchParams(search),
}));

const TODAY = todayInGuatemala();
const trips = [
  trip({ id: 't1' }),
  trip({
    id: 't2',
    status: 'IN_TRANSIT',
    destinationName: 'Flores',
    busPlate: 'C731PLR',
    driverName: 'Ana Sic',
    // 21:15 on the 20th in Guatemala, the 21st in UTC
    departureAt: '2026-10-21T03:15:00.000Z',
    estimatedArrivalAt: '2026-10-21T13:00:00.000Z',
    ticketPrice: 150,
    capacity: 44,
  }),
  trip({ id: 't3', status: 'COMPLETED', destinationName: 'Cobán' }),
  trip({ id: 't4', type: 'RENTAL', routeId: null, ticketPrice: null, destinationName: 'Antigua' }),
];

function setup({
  error = false,
  items = trips,
  address = '',
  total = items.length,
  pendingRentals = 0,
}: {
  error?: boolean;
  items?: unknown[];
  address?: string;
  total?: number;
  pendingRentals?: number;
} = {}) {
  search = address;
  const refetch = jest.fn();
  jest.mocked(useTripsPage).mockReturnValue(
    (error
      ? { data: undefined, isPending: false, isError: true, isPlaceholderData: false, refetch }
      : {
          data: tripPage(items as never, { total }),
          isPending: false,
          isError: false,
          isPlaceholderData: false,
          refetch,
        }) as never,
  );
  jest.mocked(useOwnBranch).mockReturnValue({ id: 'br', name: 'Quetzaltenango' } as never);
  jest
    .mocked(useRentalRequestsPage)
    .mockReturnValue({ data: { items: [], total: pendingRentals, page: 1, pageSize: 1 } } as never);
  render(<TripsScreen />);
  return { refetch };
}

const lastAddress = () => {
  const [url] = replace.mock.calls.at(-1) as [string];
  const [path, query = ''] = url.split('?');
  return { path, params: new URLSearchParams(query) };
};

beforeEach(() => replace.mockReset());

describe('TripsScreen', () => {
  it('links each trip to its screen', () => {
    setup();

    expect(screen.getByRole('link', { name: /Quetzaltenango.*Guatemala/ })).toHaveAttribute(
      'href',
      '/sucursal/viajes/t1',
    );
  });

  it('offers the trips and the rentals to assign as two tabs, with how many are waiting', () => {
    setup({ pendingRentals: 3 });

    expect(screen.getByRole('tab', { name: 'Viajes' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Alquileres por asignar 3' })).toBeInTheDocument();
    expect(useRentalRequestsPage).toHaveBeenCalledWith({
      status: 'PENDING',
      page: 1,
      pageSize: 1,
    });
  });

  it('opens the rentals tab in the address and leaves the trip filters behind', async () => {
    setup({ address: 'estado=en-camino&pagina=2' });

    await userEvent.click(screen.getByRole('tab', { name: /Alquileres por asignar/ }));

    expect(replace).toHaveBeenCalledWith('/sucursal/viajes?pestana=alquileres', {
      scroll: false,
    });
  });

  it('shows the rentals instead of the trips when the address asks for them', () => {
    setup({ address: 'pestana=alquileres' });

    expect(screen.getByText('alquileres por asignar')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Alquileres por asignar/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByRole('table', { name: 'Viajes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Programar viaje' })).toBeInTheDocument();
  });

  it('goes back to the trips from the rentals tab', async () => {
    setup({ address: 'pestana=alquileres&buscar=colegio' });

    await userEvent.click(screen.getByRole('tab', { name: 'Viajes' }));

    expect(replace).toHaveBeenCalledWith('/sucursal/viajes', { scroll: false });
  });

  it('names the branch and has a single primary action', () => {
    setup();

    expect(screen.getByText('Operación · Quetzaltenango')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Viajes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Programar viaje' })).toBeInTheDocument();
  });

  it('lists each trip with the day and hour of Guatemala, route, bus, driver, price and state', () => {
    setup();

    const first = screen.getByRole('row', { name: /Guatemala/ });
    expect(first).toHaveTextContent('05:30');
    expect(first).toHaveTextContent('20 oct');
    expect(first).toHaveTextContent('Quetzaltenango');
    expect(first).toHaveTextContent('C-482BTX');
    expect(first).toHaveTextContent('Julio Pérez');
    expect(first).toHaveTextContent('10:30');
    expect(first).toHaveTextContent(/Q\s?85\.00/);
    expect(first).toHaveTextContent('40');
    expect(first).toHaveTextContent('Programado');
  });

  it('shows the Guatemalan day when UTC is already the next one', () => {
    setup();

    const flores = screen.getByRole('row', { name: /Flores/ });
    expect(flores).toHaveTextContent('21:15');
    expect(flores).toHaveTextContent('20 oct');
    expect(flores).toHaveTextContent('En camino');
    expect(screen.getByRole('row', { name: /Cobán/ })).toHaveTextContent('Completado');
  });

  it('calls a rental by its name under its route', () => {
    setup();

    expect(screen.getByRole('row', { name: /Antigua/ })).toHaveTextContent('Alquiler');
    expect(screen.getByRole('row', { name: /Cobán/ })).not.toHaveTextContent('Alquiler');
  });

  it('shows a dash where a rental has no ticket price', () => {
    setup();

    expect(screen.getByRole('row', { name: /Antigua/ })).toHaveTextContent('—');
  });

  it('starts today, on every state, and offers the three states as tabs', () => {
    setup();

    expect(useTripsPage).toHaveBeenCalledWith({
      from: TODAY,
      status: 'all',
      page: 1,
      pageSize: 20,
    });
    expect(screen.getByLabelText('Desde')).toHaveValue(TODAY);
    expect(screen.getByLabelText('Hasta')).toHaveValue('');
    expect(screen.getByRole('tab', { name: 'Todos' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Programados' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'En camino' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Completados' })).toBeInTheDocument();
  });

  it('asks for what the address carries', () => {
    setup({
      address:
        'desde=2026-10-14&hasta=2026-10-20&estado=completados&buscar=xela&pagina=2&mostrar=50',
    });

    expect(useTripsPage).toHaveBeenCalledWith({
      from: '2026-10-14',
      to: '2026-10-20',
      status: 'COMPLETED',
      q: 'xela',
      page: 2,
      pageSize: 50,
    });
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-14');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-10-20');
    expect(screen.getByRole('textbox', { name: 'Buscar ruta, placa o chofer' })).toHaveValue(
      'xela',
    );
  });

  it('writes the first day in the address and goes back to the first page', () => {
    setup({ address: 'pagina=2' });

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-02' } });

    const { path, params } = lastAddress();
    expect(path).toBe('/sucursal/viajes');
    expect(params.get('desde')).toBe('2026-11-02');
    expect(params.has('pagina')).toBe(false);
  });

  it('goes back to today when the first day is cleared', () => {
    setup({ address: 'desde=2026-11-02' });

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '' } });

    expect(lastAddress().params.has('desde')).toBe(false);
  });

  it('writes the last day, and clearing it removes it from the address', () => {
    setup({ address: 'hasta=2026-11-02' });

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-09' } });
    expect(lastAddress().params.get('hasta')).toBe('2026-11-09');

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '' } });
    expect(lastAddress().params.has('hasta')).toBe(false);
  });

  it('keeps the two days from crossing', () => {
    setup({ address: 'desde=2026-11-02&hasta=2026-11-09' });

    expect(screen.getByLabelText('Desde')).toHaveAttribute('max', '2026-11-09');
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('min', '2026-11-02');
  });

  it('changes the tab in the address and goes back to the first page', async () => {
    setup({ address: 'pagina=2' });

    await userEvent.click(screen.getByRole('tab', { name: 'En camino' }));

    const { params } = lastAddress();
    expect(params.get('estado')).toBe('en-camino');
    expect(params.has('pagina')).toBe(false);
  });

  it('searches 300 ms after the last key', async () => {
    setup();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Buscar ruta, placa o chofer' }),
      'xela',
    );

    await waitFor(() => expect(lastAddress().params.get('buscar')).toBe('xela'));
  });

  it('pages in the address and counts the trips', async () => {
    setup({ total: 45, address: 'pagina=2' });

    expect(screen.getByText(/de 45/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

    expect(lastAddress().params.get('pagina')).toBe('3');
  });

  it('invites to schedule the first trip when none is coming', () => {
    setup({ items: [], total: 0 });

    expect(
      screen.getByText(
        'No hay viajes programados desde hoy. Crea el primero con «Programar viaje».',
      ),
    ).toBeInTheDocument();
  });

  it('says so when a filter finds none', () => {
    setup({ items: [], total: 0, address: 'buscar=zzz' });

    expect(screen.getByText('No hay viajes con esos filtros.')).toBeInTheDocument();
  });

  it('shows a friendly error with a retry', async () => {
    const { refetch } = setup({ error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los viajes.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });

  it('opens the schedule dialog on today', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Programar viaje' }));

    expect(screen.getByRole('dialog', { name: 'Programar viaje' })).toHaveAttribute(
      'data-day',
      TODAY,
    );
  });

  it('opens the dialog on the first day shown when it is still to come', async () => {
    setup({ address: 'desde=2999-01-05' });

    await userEvent.click(screen.getByRole('button', { name: 'Programar viaje' }));

    expect(screen.getByRole('dialog', { name: 'Programar viaje' })).toHaveAttribute(
      'data-day',
      '2999-01-05',
    );
  });
});
