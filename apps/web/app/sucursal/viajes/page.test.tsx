import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import TripsPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('../../../components/trips/trips-screen', () => ({
  TripsScreen: () => <p>lista de viajes</p>,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/viajes',
}));

const signIn = (role: 'BRANCH_ADMIN' | 'CASHIER') =>
  act(() =>
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Marta Ruiz',
        email: 'm@b.com',
        role,
        branchId: '8f9e6679-7425-40de-944b-e07fc1f90ae7',
      },
    }),
  );
beforeEach(() => replace.mockReset());
afterEach(() => act(() => clearSession()));

it('shows the trips to the branch admin', () => {
  signIn('BRANCH_ADMIN');
  render(<TripsPage />);

  expect(screen.getByText('lista de viajes')).toBeInTheDocument();
  expect(metadata.title).toBe('Viajes · debus');
});

it('sends a cashier back to their own home', () => {
  signIn('CASHIER');
  render(<TripsPage />);

  expect(screen.queryByText('lista de viajes')).not.toBeInTheDocument();
  expect(replace).toHaveBeenCalledWith('/sucursal');
});
