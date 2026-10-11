import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import AdminLayout from './layout';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/admin',
}));
beforeEach(() => replace.mockReset());
afterEach(() => act(() => clearSession()));

const signIn = (role: 'SYSTEM_ADMIN' | 'CASHIER') =>
  act(() =>
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Marta Ruiz',
        email: 'm@b.com',
        role,
        branchId: role === 'CASHIER' ? '8f9e6679-7425-40de-944b-e07fc1f90ae7' : null,
      },
    }),
  );

it('shows the admin pages inside the shell to a system administrator', () => {
  signIn('SYSTEM_ADMIN');
  render(
    <AdminLayout params={Promise.resolve({})}>
      <p>pagina</p>
    </AdminLayout>,
  );

  expect(screen.getByRole('main')).toContainElement(screen.getByText('pagina'));
  expect(screen.getByRole('link', { name: 'Sucursales' })).toBeInTheDocument();
});

it('sends anyone else to their own start page', () => {
  signIn('CASHIER');
  render(
    <AdminLayout params={Promise.resolve({})}>
      <p>pagina</p>
    </AdminLayout>,
  );

  expect(replace).toHaveBeenCalledWith('/sucursal');
  expect(screen.queryByText('pagina')).not.toBeInTheDocument();
});
