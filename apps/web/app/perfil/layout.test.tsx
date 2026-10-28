import type { UserRole } from '@debus/contracts';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import ProfileLayout from './layout';

const replace = jest.fn();
jest.mock('../../hooks/use-branches', () => ({ useBranch: () => ({ data: undefined }) }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/perfil',
}));
beforeEach(() => replace.mockReset());
afterEach(() => act(() => clearSession()));

const signIn = (role: UserRole) =>
  act(() =>
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Julio Pérez',
        email: 'j@b.com',
        role,
        branchId: role === 'SYSTEM_ADMIN' ? null : '8f9e6679-7425-40de-944b-e07fc1f90ae7',
      },
    }),
  );

const renderLayout = () =>
  render(
    <ProfileLayout params={Promise.resolve({})}>
      <p>pagina</p>
    </ProfileLayout>,
  );

it.each(['SYSTEM_ADMIN', 'BRANCH_ADMIN', 'CASHIER', 'DRIVER'] as const)(
  'shows the profile of a %s inside their shell, with its link active',
  (role) => {
    signIn(role);
    renderLayout();

    expect(screen.getByRole('main')).toContainElement(screen.getByText('pagina'));
    const links = screen.getAllByRole('link', { name: 'Mi perfil' });
    expect(links[0]).toHaveAttribute('aria-current', 'page');
  },
);

it('sends a client to their home, since their profile lives in their account', () => {
  signIn('CLIENT');
  renderLayout();

  expect(replace).toHaveBeenCalledWith('/');
  expect(screen.queryByText('pagina')).not.toBeInTheDocument();
});
