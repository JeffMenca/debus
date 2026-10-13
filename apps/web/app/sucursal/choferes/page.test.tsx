import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import DriversPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('../../../components/fleet/drivers-screen', () => ({
  DriversScreen: () => <p>lista de choferes</p>,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/choferes',
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

it('shows the drivers to the branch admin', () => {
  signIn('BRANCH_ADMIN');
  render(<DriversPage />);

  expect(screen.getByText('lista de choferes')).toBeInTheDocument();
  expect(metadata.title).toBe('Choferes · debus');
});

it('sends a cashier back to their own home', () => {
  signIn('CASHIER');
  render(<DriversPage />);

  expect(screen.queryByText('lista de choferes')).not.toBeInTheDocument();
  expect(replace).toHaveBeenCalledWith('/sucursal');
});
