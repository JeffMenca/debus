import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { clearSession, markUnavailable, setSession } from '@/lib/auth/session-store';
import { RoleHome } from './role-home';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal',
}));
beforeEach(() => replace.mockReset());
afterEach(() => act(() => clearSession()));

const session = (role: 'SYSTEM_ADMIN' | 'BRANCH_ADMIN' | 'CLIENT') => ({
  accessToken: 'a',
  accessExpiresIn: 900,
  user: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    fullName: 'Marta Ruiz',
    email: 'm@b.com',
    role,
    branchId: role === 'BRANCH_ADMIN' ? '8f9e6679-7425-40de-944b-e07fc1f90ae7' : null,
  },
});

describe('RoleHome', () => {
  // First on purpose: the store only reports "unknown" until something touches it.
  it('waits while the session is still being restored', () => {
    render(<RoleHome allowed={['SYSTEM_ADMIN']} />);

    expect(replace).not.toHaveBeenCalled();
  });

  it('greets a person with the right role', () => {
    act(() => setSession(session('BRANCH_ADMIN')));
    render(<RoleHome allowed={['BRANCH_ADMIN', 'CASHIER']} />);

    expect(screen.getByRole('heading', { name: 'Hola, Marta Ruiz' })).toBeInTheDocument();
    expect(screen.getByText('Pronto verás aquí tu panel.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends people with another role to their own home', () => {
    act(() => setSession(session('CLIENT')));
    render(<RoleHome allowed={['SYSTEM_ADMIN']} />);

    expect(replace).toHaveBeenCalledWith('/');
    expect(screen.queryByText(/Hola/)).not.toBeInTheDocument();
  });

  it('sends visitors without a session to the login once restoring is over', () => {
    act(() => clearSession());
    render(<RoleHome allowed={['SYSTEM_ADMIN']} />);

    expect(replace).toHaveBeenCalledWith('/login?siguiente=%2Fsucursal');
  });

  describe('when the service cannot be reached', () => {
    const fetchMock = jest.fn();
    beforeEach(() => {
      fetchMock.mockReset();
      global.fetch = fetchMock as unknown as typeof fetch;
    });

    it('explains it and offers to retry instead of sending anyone to the login', async () => {
      act(() => markUnavailable());
      render(<RoleHome allowed={['SYSTEM_ADMIN']} />);

      expect(
        screen.getByRole('heading', { level: 1, name: 'No pudimos conectarnos' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.',
      );
      expect(replace).not.toHaveBeenCalled();

      fetchMock.mockResolvedValue(Response.json(session('SYSTEM_ADMIN')));
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

      expect(await screen.findByRole('heading', { name: 'Hola, Marta Ruiz' })).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
    });

    it('goes to the login if the retry finds the session ended', async () => {
      act(() => markUnavailable());
      render(<RoleHome allowed={['SYSTEM_ADMIN']} />);
      fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

      await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?siguiente=%2Fsucursal'));
    });
  });
});
