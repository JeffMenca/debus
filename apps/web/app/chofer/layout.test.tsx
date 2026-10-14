import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import DriverLayout from './layout';

const replace = jest.fn();
jest.mock('../../hooks/use-branches', () => ({ useBranch: () => ({ data: undefined }) }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/chofer',
}));
beforeEach(() => replace.mockReset());
afterEach(() => act(() => clearSession()));

const signIn = (role: 'BRANCH_ADMIN' | 'DRIVER') =>
  act(() =>
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Julio Pérez',
        email: 'j@b.com',
        role,
        branchId: '8f9e6679-7425-40de-944b-e07fc1f90ae7',
      },
    }),
  );

it('shows the driver pages inside the shell', () => {
  signIn('DRIVER');
  render(
    <DriverLayout params={Promise.resolve({})}>
      <p>pagina</p>
    </DriverLayout>,
  );

  expect(screen.getByRole('main')).toContainElement(screen.getByText('pagina'));
  expect(screen.getAllByRole('link', { name: 'Mis viajes' }).length).toBeGreaterThan(0);
});

it('sends a branch admin to their own panel', () => {
  signIn('BRANCH_ADMIN');
  render(
    <DriverLayout params={Promise.resolve({})}>
      <p>pagina</p>
    </DriverLayout>,
  );

  expect(replace).toHaveBeenCalledWith('/sucursal');
  expect(screen.queryByText('pagina')).not.toBeInTheDocument();
});

it('sends a visitor to the login and comes back to the page', () => {
  render(
    <DriverLayout params={Promise.resolve({})}>
      <p>pagina</p>
    </DriverLayout>,
  );

  expect(replace).toHaveBeenCalledWith('/login?siguiente=%2Fchofer');
});
