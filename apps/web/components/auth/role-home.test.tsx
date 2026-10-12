import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import { RoleHome } from './role-home';

afterEach(() => act(() => clearSession()));

describe('RoleHome', () => {
  it('greets the person by name', () => {
    act(() =>
      setSession({
        accessToken: 'a',
        accessExpiresIn: 900,
        user: {
          id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
          fullName: 'Marta Ruiz',
          email: 'm@b.com',
          role: 'SYSTEM_ADMIN',
          branchId: null,
        },
      }),
    );
    render(<RoleHome />);

    expect(screen.getByRole('heading', { name: 'Hola, Marta Ruiz' })).toBeInTheDocument();
    expect(screen.getByText('Pronto verás aquí tu panel.')).toBeInTheDocument();
  });

  it('renders nothing without a session', () => {
    act(() => clearSession());
    const { container } = render(<RoleHome />);

    expect(container).toBeEmptyDOMElement();
  });
});
