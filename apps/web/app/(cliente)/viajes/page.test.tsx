import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import ClientLayout from '../layout';
import TripsPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('../../../components/tickets/trip-search-screen', () => ({
  TripSearchScreen: () => <p>buscar viajes</p>,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/viajes',
}));

const signIn = (role: 'CLIENT' | 'CASHIER') =>
  act(() =>
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Ana Méndez',
        email: 'a@b.com',
        role,
        branchId: null,
      },
    }),
  );
const renderPage = () =>
  render(
    <ClientLayout>
      <TripsPage />
    </ClientLayout>,
  );
beforeEach(() => replace.mockReset());
afterEach(() => act(() => clearSession()));

it('shows the search of a client inside the client shell', () => {
  signIn('CLIENT');
  renderPage();

  expect(metadata.title).toBe('Viajes · debus');
  expect(screen.getByRole('main')).toContainElement(screen.getByText('buscar viajes'));
  expect(screen.getByRole('link', { name: 'Viajes' })).toHaveAttribute('aria-current', 'page');
});

it('sends staff to their own home', () => {
  signIn('CASHIER');
  renderPage();

  expect(screen.queryByText('buscar viajes')).not.toBeInTheDocument();
  expect(replace).toHaveBeenCalledWith('/sucursal');
});
