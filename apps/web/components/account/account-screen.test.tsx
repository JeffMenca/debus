import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { movement, movementPage, profile, wallet } from '../../test-support/account';
import { queryWrapper } from '../../test-support/query-wrapper';
import { rental, rentalPage } from '../../test-support/rentals';
import { mockGatewayApi, soldTicket, ticketPage } from '../../test-support/tickets';
import { AccountScreen } from './account-screen';

const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/cuenta',
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  search = '';
  mockGatewayApi({
    'GET /clientes/wallet': () => Response.json(wallet()),
    'GET /clientes/profile': () => Response.json(profile()),
    'GET /clientes/wallet/movements': () => Response.json(movementPage([movement()])),
    'GET /clientes/rentals/mine': () => Response.json(rentalPage([rental()])),
    'GET /ventas/tickets': () =>
      Response.json(ticketPage([soldTicket()], null, { total: 21, page: 2 })),
  });
});
afterEach(() => jest.restoreAllMocks());

const renderScreen = () => render(<AccountScreen />, { wrapper: queryWrapper().wrapper });

describe('AccountScreen', () => {
  it('puts the wallet, the top-up and the profile next to the trips', async () => {
    renderScreen();

    expect(screen.getByRole('heading', { name: 'Mis viajes', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cartera digital' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recargar saldo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Perfil' })).toBeInTheDocument();
    expect(await screen.findByText('Ana Méndez')).toBeInTheDocument();
  });

  it('opens on the tickets tab and moves tabs through the address, back to the first page', async () => {
    search = 'pagina=2';
    renderScreen();

    expect(screen.getByRole('tab', { name: 'Boletos', selected: true })).toBeInTheDocument();
    expect(await screen.findByText('Quetzaltenango a Guatemala')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Movimientos' }));

    expect(replace).toHaveBeenCalledWith('/cuenta?pestana=movimientos', { scroll: false });
  });

  it('shows the movements when the address asks for them', async () => {
    search = 'pestana=movimientos';
    renderScreen();

    expect(await screen.findByText('Recarga de saldo')).toBeInTheDocument();
  });

  it('shows the rentals of the client on their tab', async () => {
    search = 'pestana=alquileres';
    renderScreen();

    expect(await screen.findByText('Precio listo, falta pagar')).toBeInTheDocument();
  });
});
