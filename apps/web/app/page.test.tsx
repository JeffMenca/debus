import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { clearSession, getSessionStatus, setSession } from '@/lib/auth/session-store';
import HomePage from './page';

// The store keeps its state between tests, so the "checking" state is forced instead.
const mockStatus = jest.fn();
jest.mock('../lib/auth/session-store', () => {
  const actual = jest.requireActual('../lib/auth/session-store');
  return { ...actual, useSessionStatus: () => mockStatus() };
});

const fetchMock = jest.fn();
beforeEach(() => {
  mockStatus.mockImplementation(getSessionStatus);
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => act(() => clearSession()));

const session = (role: 'SYSTEM_ADMIN' | 'BRANCH_ADMIN' | 'CLIENT', fullName = 'Ana López') => ({
  accessToken: 'a',
  accessExpiresIn: 900,
  user: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    fullName,
    email: 'ana@correo.com',
    role,
    branchId: role === 'BRANCH_ADMIN' ? '8f9e6679-7425-40de-944b-e07fc1f90ae7' : null,
  },
});

describe('HomePage', () => {
  it('shows no links while the session is being checked', () => {
    mockStatus.mockReturnValue('unknown');
    render(<HomePage />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('presents the brand promise and the benefits', () => {
    act(() => clearSession());
    render(<HomePage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Tu próximo viaje empieza aquí.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Compra tus boletos' })).toBeInTheDocument();
  });

  it('offers a visitor the login and the sign-up, with a single primary action', () => {
    act(() => clearSession());
    render(<HomePage />);

    const logIn = screen.getByRole('link', { name: 'Iniciar sesión' });
    const signUp = screen.getByRole('link', { name: 'Crear cuenta' });
    expect(logIn).toHaveAttribute('href', '/login');
    expect(logIn).not.toHaveClass('bg-primary');
    expect(signUp).toHaveAttribute('href', '/registro');
    expect(signUp).toHaveClass('bg-primary');
    expect(screen.queryByRole('link', { name: 'Ir a mi panel' })).not.toBeInTheDocument();
  });

  it('sends staff to their own panel', () => {
    act(() => setSession(session('BRANCH_ADMIN')));
    render(<HomePage />);

    expect(screen.getByRole('link', { name: 'Ir a mi panel' })).toHaveAttribute(
      'href',
      '/sucursal',
    );
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Crear cuenta' })).not.toBeInTheDocument();
  });

  it('greets a client by first name and does not offer a panel', () => {
    act(() => setSession(session('CLIENT')));
    render(<HomePage />);

    expect(screen.getByText('Hola, Ana')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ir a mi panel' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('greets a client whose name is a single word', () => {
    act(() => setSession(session('CLIENT', '  Ana ')));
    render(<HomePage />);

    expect(screen.getByText('Hola, Ana')).toBeInTheDocument();
  });

  it('closes the session and stays on the home page', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    act(() => setSession(session('CLIENT')));
    render(<HomePage />);

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/session/logout', expect.anything());
    expect(await screen.findByRole('link', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.queryByText('Hola, Ana')).not.toBeInTheDocument();
  });

  it('moves the keyboard focus to the login link after signing out', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    act(() => setSession(session('CLIENT')));
    render(<HomePage />);
    screen.getByRole('button', { name: 'Cerrar sesión' }).focus();

    await userEvent.keyboard('{Enter}');

    expect(await screen.findByRole('link', { name: 'Iniciar sesión' })).toHaveFocus();
  });
});
