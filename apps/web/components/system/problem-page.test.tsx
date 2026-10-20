import { act, render, screen } from '@testing-library/react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import { HomeLink, ProblemPage } from './problem-page';

const session = (role: 'SYSTEM_ADMIN' | 'BRANCH_ADMIN' | 'CASHIER' | 'DRIVER' | 'CLIENT') => ({
  accessToken: 'a',
  accessExpiresIn: 900,
  user: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    fullName: 'Ana López',
    email: 'ana@correo.com',
    role,
    branchId: null,
  },
});

afterEach(() => act(() => clearSession()));

describe('ProblemPage', () => {
  it('says what happened in one heading, explains it and offers its actions', () => {
    render(
      <ProblemPage title="No encontramos esta página" actions={<button>Algo</button>}>
        La dirección no existe.
      </ProblemPage>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'No encontramos esta página' }),
    ).toBeInTheDocument();
    expect(screen.getByText('La dirección no existe.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Algo' })).toBeInTheDocument();
  });
});

describe('HomeLink', () => {
  it('leads a visitor to the home page', () => {
    render(<HomeLink />);

    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/');
  });

  it.each([
    ['CLIENT', '/cuenta'],
    ['SYSTEM_ADMIN', '/admin'],
    ['BRANCH_ADMIN', '/sucursal'],
    ['CASHIER', '/sucursal'],
    ['DRIVER', '/chofer'],
  ] as const)('leads a %s to %s once the session is known', (role, path) => {
    render(<HomeLink />);

    act(() => setSession(session(role)));

    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', path);
  });

  it('can be a quiet link next to a primary action', () => {
    render(<HomeLink quiet />);

    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/');
  });
});
