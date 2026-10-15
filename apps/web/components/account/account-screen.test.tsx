import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  mockClientesApi,
  movement,
  movementPage,
  profile,
  wallet,
} from '../../test-support/account';
import { queryWrapper } from '../../test-support/query-wrapper';
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
  mockClientesApi({
    'GET /wallet': () => Response.json(wallet()),
    'GET /profile': () => Response.json(profile()),
    'GET /wallet/movements': () => Response.json(movementPage([movement()])),
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

  it('opens on the tickets tab, still empty, and moves tabs through the address', async () => {
    renderScreen();

    expect(screen.getByRole('tab', { name: 'Boletos', selected: true })).toBeInTheDocument();
    expect(screen.getByText(/Aquí verás los boletos/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Movimientos' }));

    expect(replace).toHaveBeenCalledWith('/cuenta?pestana=movimientos', { scroll: false });
  });

  it('shows the movements when the address asks for them', async () => {
    search = 'pestana=movimientos';
    renderScreen();

    expect(await screen.findByText('Recarga de saldo')).toBeInTheDocument();
  });

  it('shows the rentals tab, still empty', () => {
    search = 'pestana=alquileres';
    renderScreen();

    expect(screen.getByText(/Aquí verás los buses que alquiles/)).toBeInTheDocument();
  });
});
