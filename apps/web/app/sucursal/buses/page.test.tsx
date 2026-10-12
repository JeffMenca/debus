import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import BusesPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('../../../components/fleet/buses-screen', () => ({
  BusesScreen: () => <p>lista de buses</p>,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/buses',
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

it('shows the buses to the branch admin', () => {
  signIn('BRANCH_ADMIN');
  render(<BusesPage />);

  expect(screen.getByText('lista de buses')).toBeInTheDocument();
  expect(metadata.title).toBe('Buses · debus');
});

it('sends a cashier back to their own home', () => {
  signIn('CASHIER');
  render(<BusesPage />);

  expect(screen.queryByText('lista de buses')).not.toBeInTheDocument();
  expect(replace).toHaveBeenCalledWith('/sucursal');
});
