import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import Page, { metadata } from './page';

const replace = jest.fn();
jest.mock('../../../components/rentals/branch-rentals-screen', () => ({
  BranchRentalsScreen: () => <p>pantalla de alquileres</p>,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/alquileres',
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

it('shows the rentals to the branch admin', () => {
  signIn('BRANCH_ADMIN');
  render(<Page />);

  expect(screen.getByText('pantalla de alquileres')).toBeInTheDocument();
  expect(metadata.title).toBe('Alquileres · debus');
});

it('sends a cashier back to their own home', () => {
  signIn('CASHIER');
  render(<Page />);

  expect(screen.queryByText('pantalla de alquileres')).not.toBeInTheDocument();
  expect(replace).toHaveBeenCalledWith('/sucursal');
});
