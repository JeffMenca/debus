import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { clearSession, setSession } from '@/lib/auth/session-store';
import { AppSidebar } from './app-sidebar';

jest.mock('next/navigation', () => ({
  usePathname: () => '/admin/usuarios',
  useRouter: () => ({ replace: jest.fn() }),
}));

const signIn = (role: 'SYSTEM_ADMIN' | 'CASHIER' = 'SYSTEM_ADMIN') =>
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

const renderSidebar = (context?: { label: string; value: string }) =>
  render(
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar context={context} />
      </SidebarProvider>
    </TooltipProvider>,
  );

afterEach(() => act(() => clearSession()));

describe('AppSidebar', () => {
  it('groups the links of the role', () => {
    signIn();
    renderSidebar();

    expect(screen.getByText('Administración')).toBeInTheDocument();
    expect(screen.getByText('Sistema')).toBeInTheDocument();
    for (const name of ['Panel', 'Usuarios', 'Sucursales', 'Configuración', 'Estado del sistema']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'href',
      '/admin/usuarios',
    );
  });

  it('marks the current page only', () => {
    signIn();
    renderSidebar();

    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Panel' })).not.toHaveAttribute('aria-current');
  });

  it('shows who is signed in and offers to sign out', () => {
    signIn();
    renderSidebar();

    expect(screen.getByText('MR')).toBeInTheDocument();
    expect(screen.getByText('Marta Ruiz')).toBeInTheDocument();
    expect(screen.getByText('Admin. del sistema')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('collapses and expands with the floating button', async () => {
    signIn();
    renderSidebar();

    const collapse = screen.getByRole('button', { name: 'Colapsar menú' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(collapse);

    const expand = screen.getByRole('button', { name: 'Expandir menú' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the branch card only when given a context', () => {
    signIn('CASHIER');
    const { unmount } = renderSidebar();
    expect(screen.queryByText('Quetzaltenango')).not.toBeInTheDocument();
    unmount();

    renderSidebar({ label: 'Sucursal', value: 'Quetzaltenango' });
    expect(screen.getByText('Sucursal')).toBeInTheDocument();
    expect(screen.getByText('Quetzaltenango')).toBeInTheDocument();
  });

  it('renders nothing without a session', () => {
    const { container } = renderSidebar();

    expect(container.querySelector('[data-slot="sidebar"]')).toBeNull();
  });
});
