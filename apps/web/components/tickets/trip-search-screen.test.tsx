import { todayInGuatemala } from '@debus/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError } from '../../test-support/account';
import { queryWrapper } from '../../test-support/query-wrapper';
import { availableTrip, availableTripPage, mockVentasApi } from '../../test-support/tickets';
import { dayChip, weekStrip } from '@/lib/tickets/trip-search-params';
import { TripSearchScreen } from './trip-search-screen';

const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/viajes',
  useSearchParams: () => new URLSearchParams(search),
}));

const PLACES = {
  origins: ['Cobán', 'Quetzaltenango'],
  destinations: ['Ciudad de Guatemala', 'Flores'],
};

function mockApi(trips: () => Response | Promise<Response>) {
  return mockVentasApi({
    'GET /trips': trips,
    'GET /trips/places': () => Response.json(PLACES),
  });
}
const tripsUrl = (fetchMock: jest.SpyInstance) =>
  fetchMock.mock.calls.map(([url]) => String(url)).find((url) => url.includes('/trips?'));
const renderScreen = () => render(<TripSearchScreen />, { wrapper: queryWrapper().wrapper });

beforeEach(() => {
  search = '';
  replace.mockReset();
});
afterEach(() => jest.restoreAllMocks());

describe('TripSearchScreen', () => {
  it('lists the trips of today anywhere, with the search in the hero', async () => {
    const today = todayInGuatemala();
    const fetchMock = mockApi(() => Response.json(availableTripPage([availableTrip()])));
    renderScreen();

    expect(screen.getByRole('heading', { level: 1, name: '¿A dónde viajamos hoy?' })).toBeVisible();
    expect(
      await screen.findByRole('link', { name: /Elegir asientos de Quetzaltenango/ }),
    ).toBeVisible();
    expect(tripsUrl(fetchMock)).toContain(`from=${today}&page=1&pageSize=20&to=${today}`);
    expect(screen.getByRole('heading', { level: 2, name: 'Viajes disponibles' })).toBeVisible();
    expect(screen.getByText('Todos los destinos, cualquier origen')).toBeInTheDocument();
  });

  it('searches the chosen places, day and passengers through the address', async () => {
    mockApi(() => Response.json(availableTripPage([])));
    renderScreen();

    await userEvent.click(await screen.findByRole('combobox', { name: 'Origen' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Quetzaltenango' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Destino' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Flores' }));
    fireEvent.change(screen.getByLabelText('Fecha de salida'), { target: { value: '2026-12-24' } });
    await userEvent.clear(screen.getByLabelText('Pasajeros'));
    await userEvent.type(screen.getByLabelText('Pasajeros'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar viajes' }));

    expect(replace).toHaveBeenCalledWith(
      '/viajes?origen=Quetzaltenango&destino=Flores&fecha=2026-12-24&pasajeros=3',
      { scroll: false },
    );
  });

  it('turns the trip around and asks the server for that way only', async () => {
    search = 'origen=Quetzaltenango&destino=Flores&pasajeros=2';
    const fetchMock = mockApi(() => Response.json(availableTripPage([])));
    renderScreen();

    await waitFor(() => expect(tripsUrl(fetchMock)).toContain('destination=Flores&from='));
    expect(tripsUrl(fetchMock)).toContain('origin=Quetzaltenango&page=1&pageSize=20&seats=2');
    expect(screen.getByText('Quetzaltenango a Flores')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Invertir origen y destino' }));
    await userEvent.click(screen.getByRole('button', { name: 'Buscar viajes' }));

    expect(replace).toHaveBeenCalledWith(
      '/viajes?origen=Flores&destino=Quetzaltenango&pasajeros=2',
      {
        scroll: false,
      },
    );
  });

  it('refuses a number of passengers a purchase cannot carry', async () => {
    mockApi(() => Response.json(availableTripPage([])));
    renderScreen();

    await userEvent.clear(screen.getByLabelText('Pasajeros'));
    await userEvent.type(screen.getByLabelText('Pasajeros'), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar viajes' }));

    expect(screen.getByText('Escribe de 1 a 10 pasajeros.')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('moves to another day of the strip at once', async () => {
    mockApi(() => Response.json(availableTripPage([])));
    renderScreen();
    const tomorrow = weekStrip(todayInGuatemala())[1]!;

    const day = screen.getByRole('button', { name: dayChip(tomorrow).label });
    await userEvent.click(day);

    expect(screen.getByRole('button', { name: dayChip(todayInGuatemala()).label })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(replace).toHaveBeenCalledWith(`/viajes?fecha=${tomorrow}`, { scroll: false });
  });

  it('pages on the server', async () => {
    mockApi(() =>
      Response.json(availableTripPage([availableTrip()], { total: 45, page: 1, pageSize: 20 })),
    );
    renderScreen();

    await userEvent.click(await screen.findByRole('button', { name: 'Página siguiente' }));

    expect(replace).toHaveBeenCalledWith('/viajes?pagina=2', { scroll: false });
  });

  it('says when no trip leaves that day', async () => {
    mockApi(() => Response.json(availableTripPage([])));
    renderScreen();

    expect(
      await screen.findByText(
        'No hay viajes para ese día. Prueba con otra fecha o cambia el origen o el destino.',
      ),
    ).toBeVisible();
  });

  it('shows the problem and lets the person retry', async () => {
    mockApi(() => apiError(503, 'El servicio no respondió.'));
    renderScreen();

    expect(await screen.findByText('El servicio no respondió.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });
});
