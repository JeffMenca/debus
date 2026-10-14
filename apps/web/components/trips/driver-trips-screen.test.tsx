import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useOwnBranch } from '../../hooks/use-own-branch';
import { useTripsPage } from '../../hooks/use-trips';
import { trip, tripPage } from '../../test-support/trips';
import { DriverTripsScreen } from './driver-trips-screen';

jest.mock('../../hooks/use-own-branch');
jest.mock('../../hooks/use-trips');
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/chofer',
  useSearchParams: () => new URLSearchParams(search),
}));

const upcoming = [
  trip({ id: 't1' }),
  trip({ id: 't2', destinationName: 'Flores', departureAt: '2026-10-21T11:30:00.000Z' }),
];
const onTheRoad = trip({ id: 'r1', status: 'IN_TRANSIT', destinationName: 'Cobán' });

function setup({
  address = '',
  items = upcoming,
  road = [] as ReturnType<typeof trip>[],
  error = false,
}: { address?: string; items?: unknown[]; road?: unknown[]; error?: boolean } = {}) {
  search = address;
  const refetch = jest.fn();
  jest.mocked(useTripsPage).mockImplementation(((query: { pageSize: number }) =>
    query.pageSize === 5
      ? { data: tripPage(road as never), isPending: false, isError: false }
      : error
        ? { data: undefined, isPending: false, isError: true, isPlaceholderData: false, refetch }
        : {
            data: tripPage(items as never),
            isPending: false,
            isError: false,
            isPlaceholderData: false,
            refetch,
          }) as never);
  jest.mocked(useOwnBranch).mockReturnValue({ id: 'br', name: 'Quetzaltenango' } as never);
  render(<DriverTripsScreen />);
  return { refetch };
}

beforeEach(() => replace.mockReset());

it('names the screen and the branch and offers no way to schedule', () => {
  setup();

  expect(screen.getByRole('heading', { level: 1, name: 'Mis viajes' })).toBeInTheDocument();
  expect(screen.getByText('Chofer · Quetzaltenango')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Programar viaje' })).not.toBeInTheDocument();
});

it('opens on the upcoming trips and offers the three states', () => {
  setup();

  expect(useTripsPage).toHaveBeenCalledWith({ status: 'SCHEDULED', page: 1, pageSize: 20 });
  expect(screen.getByRole('tab', { name: 'Próximos' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: 'En ruta' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Completados' })).toBeInTheDocument();
});

it('links each trip to its own screen', () => {
  setup();

  expect(screen.getByRole('link', { name: /Quetzaltenango.*Guatemala/ })).toHaveAttribute(
    'href',
    '/chofer/viajes/t1',
  );
  expect(screen.getByRole('link', { name: /Flores/ })).toHaveAttribute('href', '/chofer/viajes/t2');
});

it('leaves out the price and the capacity, which a driver does not need', () => {
  setup();

  expect(screen.queryByRole('columnheader', { name: 'Precio' })).not.toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Capacidad' })).not.toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Bus' })).toBeInTheDocument();
});

it('keeps the state in the address', async () => {
  setup();

  await userEvent.click(screen.getByRole('tab', { name: 'En ruta' }));

  expect(replace).toHaveBeenCalledWith('/chofer?estado=en-ruta', { scroll: false });
});

it('asks for what the address carries', () => {
  setup({ address: 'estado=completados&pagina=2' });

  expect(useTripsPage).toHaveBeenCalledWith({ status: 'COMPLETED', page: 2, pageSize: 20 });
});

it.each([
  ['', 'No tienes viajes próximos.'],
  ['estado=en-ruta', 'No tienes viajes en ruta.'],
  ['estado=completados', 'Aún no tienes viajes completados.'],
])('says so when there is nothing to show (%s)', (address, message) => {
  setup({ address, items: [] });

  expect(screen.getByText(message)).toBeInTheDocument();
});

it('puts a trip on the road on top, with the way to register its arrival', () => {
  setup({ road: [onTheRoad] });

  const banner = screen.getByRole('region', { name: 'Viaje en ruta' });
  expect(banner).toHaveTextContent('Quetzaltenango a Cobán');
  expect(screen.getByRole('link', { name: 'Registrar llegada' })).toHaveAttribute(
    'href',
    '/chofer/viajes/r1',
  );
});

it('shows no banner when nothing is on the road', () => {
  setup();

  expect(screen.queryByRole('region', { name: 'Viaje en ruta' })).not.toBeInTheDocument();
});

it('shows a friendly error with a retry', async () => {
  const { refetch } = setup({ error: true });

  expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar tus viajes.');
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

  expect(refetch).toHaveBeenCalled();
});
