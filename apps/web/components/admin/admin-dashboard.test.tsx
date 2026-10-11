import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import { useBranches } from '../../hooks/use-branches';
import { useSettings } from '../../hooks/use-settings';
import { useUsers } from '../../hooks/use-users';
import { AdminDashboard } from './admin-dashboard';

jest.mock('../../hooks/use-branches');
jest.mock('../../hooks/use-users');
jest.mock('../../hooks/use-settings');

const branch = (id: string, active: boolean) => ({ id, active });
const user = (id: string, role: string, status: string) => ({ id, role, status });
const version = {
  id: 'v',
  depreciationPerKm: 1.25,
  rentalRatePerKm: 12,
  effectiveFrom: '2026-10-10',
  createdAt: '2026-10-10T15:00:00.000Z',
  createdByName: 'Marta',
};

function mockData({
  settings = { current: version, versions: [version] },
  loading = false,
}: { settings?: unknown; loading?: boolean } = {}) {
  jest.mocked(useBranches).mockReturnValue({
    data: loading ? undefined : [branch('a', true), branch('b', true), branch('c', false)],
  } as never);
  jest.mocked(useUsers).mockReturnValue({
    data: loading
      ? undefined
      : [
          user('1', 'CASHIER', 'ACTIVE'),
          user('2', 'DRIVER', 'ACTIVE'),
          user('3', 'BRANCH_ADMIN', 'ACTIVE'),
          user('4', 'CLIENT', 'ACTIVE'),
          user('5', 'CASHIER', 'PENDING'),
        ],
  } as never);
  jest.mocked(useSettings).mockReturnValue({ data: loading ? undefined : settings } as never);
}

beforeEach(() => {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  act(() =>
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Marta Ruiz Pérez',
        email: 'm@b.com',
        role: 'SYSTEM_ADMIN',
        branchId: null,
      },
    }),
  );
});
afterEach(() => act(() => clearSession()));

describe('AdminDashboard', () => {
  it('greets by first name and shows the four counts', () => {
    mockData();
    render(<AdminDashboard />);

    expect(screen.getByRole('heading', { level: 1, name: 'Hola, Marta' })).toBeInTheDocument();
    expect(screen.getByText('Sucursales activas').previousSibling).toHaveTextContent('2');
    expect(screen.getByText('Usuarios activos').previousSibling).toHaveTextContent('3');
    expect(screen.getByText('Invitaciones pendientes').previousSibling).toHaveTextContent('1');
    expect(screen.getByText('Depreciación por km').previousSibling).toHaveTextContent(/Q\s?1\.25/);
  });

  it('has no primary button when everything is set up', () => {
    mockData();
    render(<AdminDashboard />);

    expect(screen.queryByText('Falta la configuración')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Definir configuración' })).not.toBeInTheDocument();
  });

  it('warns when the settings are missing and offers the one primary action', () => {
    mockData({ settings: { current: null, versions: [] } });
    render(<AdminDashboard />);

    expect(screen.getByText('Falta la configuración')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Definir configuración' })).toHaveAttribute(
      'href',
      '/admin/configuracion',
    );
    expect(screen.getByText('Depreciación por km').previousSibling).toHaveTextContent(
      'Sin definir',
    );
  });

  it('links to the main screens', () => {
    mockData();
    render(<AdminDashboard />);

    expect(screen.getByRole('link', { name: /Usuarios/ })).toHaveAttribute(
      'href',
      '/admin/usuarios',
    );
    expect(screen.getByRole('link', { name: /Sucursales/ })).toHaveAttribute(
      'href',
      '/admin/sucursales',
    );
    expect(screen.getByRole('link', { name: /Configuración/ })).toHaveAttribute(
      'href',
      '/admin/configuracion',
    );
  });

  it('shows placeholders while loading', () => {
    mockData({ loading: true });
    render(<AdminDashboard />);

    expect(screen.getAllByLabelText('Cargando')).toHaveLength(4);
    expect(screen.queryByText('Falta la configuración')).not.toBeInTheDocument();
  });
});
