import { act, render, screen } from '@testing-library/react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import NotFound from './not-found';

afterEach(() => act(() => clearSession()));

describe('the page for an address that does not exist', () => {
  it('says so in plain Spanish and leads back to the start', () => {
    render(<NotFound />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'No encontramos esta página' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no existe o ya no está disponible/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/');
  });

  it('leads a signed-in person to their own area', () => {
    render(<NotFound />);

    act(() =>
      setSession({
        accessToken: 'a',
        accessExpiresIn: 900,
        user: {
          id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
          fullName: 'Ana López',
          email: 'ana@correo.com',
          role: 'BRANCH_ADMIN',
          branchId: '9b2c7a10-1111-4c4c-8888-123456789abc',
        },
      }),
    );

    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/sucursal');
  });
});
