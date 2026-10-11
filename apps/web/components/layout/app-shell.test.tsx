import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import { AppShell } from './app-shell';

jest.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ replace: jest.fn() }),
}));

beforeEach(() =>
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
  ),
);
afterEach(() => act(() => clearSession()));

describe('AppShell', () => {
  it('puts the page inside main, next to the sidebar', () => {
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );

    expect(screen.getByRole('main')).toContainElement(screen.getByText('contenido'));
    expect(screen.getByRole('link', { name: 'Usuarios' })).toBeInTheDocument();
  });

  it('has a top bar with the menu button for phones only', () => {
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );

    const open = screen.getByRole('button', { name: 'Abrir menú' });
    expect(open.parentElement).toHaveClass('md:hidden');
  });
});
