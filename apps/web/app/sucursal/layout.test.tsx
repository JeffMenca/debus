import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import BranchLayout from './layout';

const replace = jest.fn();
jest.mock('../../hooks/use-branches', () => ({ useBranch: () => ({ data: undefined }) }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal',
}));
beforeEach(() => replace.mockReset());
afterEach(() => act(() => clearSession()));

const signIn = (role: 'BRANCH_ADMIN' | 'CASHIER' | 'DRIVER' | 'SYSTEM_ADMIN') =>
  act(() =>
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Marta Ruiz',
        email: 'm@b.com',
        role,
        branchId: role === 'SYSTEM_ADMIN' ? null : '8f9e6679-7425-40de-944b-e07fc1f90ae7',
      },
    }),
  );

it.each(['BRANCH_ADMIN', 'CASHIER'] as const)(
  'shows the branch pages inside the shell to the %s',
  (role) => {
    signIn(role);
    render(
      <BranchLayout params={Promise.resolve({})}>
        <p>pagina</p>
      </BranchLayout>,
    );

    expect(screen.getByRole('main')).toContainElement(screen.getByText('pagina'));
  },
);

it('sends a system administrator to the admin panel', () => {
  signIn('SYSTEM_ADMIN');
  render(
    <BranchLayout params={Promise.resolve({})}>
      <p>pagina</p>
    </BranchLayout>,
  );

  expect(replace).toHaveBeenCalledWith('/admin');
});

it('sends a driver to their own trips', () => {
  signIn('DRIVER');
  render(
    <BranchLayout params={Promise.resolve({})}>
      <p>pagina</p>
    </BranchLayout>,
  );

  expect(replace).toHaveBeenCalledWith('/chofer');
  expect(screen.queryByText('pagina')).not.toBeInTheDocument();
});

it('sends a visitor to the login and comes back to the page', () => {
  act(() => clearSession());
  render(
    <BranchLayout params={Promise.resolve({})}>
      <p>pagina</p>
    </BranchLayout>,
  );

  expect(replace).toHaveBeenCalledWith('/login?siguiente=%2Fsucursal');
});
