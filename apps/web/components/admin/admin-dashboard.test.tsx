import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import { useBranchCounts } from '../../hooks/use-branches';
import { useSettingsSummary } from '../../hooks/use-settings';
import { useUserCounts } from '../../hooks/use-users';
import { AdminDashboard } from './admin-dashboard';

jest.mock('../../hooks/use-branches');
jest.mock('../../hooks/use-users');
jest.mock('../../hooks/use-settings');

const version = {
  id: 'v',
  depreciationPerKm: 1.25,
  rentalRatePerKm: 12,
  effectiveFrom: '2026-10-10',
  createdAt: '2026-10-10T15:00:00.000Z',
  createdByName: 'Marta',
};

function mockData({
  summary = { current: version, upcoming: null },
  branches = { active: 2, inactive: 1 },
  staff = { ACTIVE: 3, PENDING: 1, INACTIVE: 4 },
  loading = false,
}: { summary?: unknown; branches?: unknown; staff?: unknown; loading?: boolean } = {}) {
  jest.mocked(useBranchCounts).mockReturnValue({ data: loading ? undefined : branches } as never);
  jest.mocked(useUserCounts).mockReturnValue({ data: loading ? undefined : staff } as never);
  jest.mocked(useSettingsSummary).mockReturnValue({ data: loading ? undefined : summary } as never);
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
  it('counts with single-row requests that read the summary, never the people', () => {
    mockData();
    render(<AdminDashboard />);

    expect(useBranchCounts).toHaveBeenCalledWith();
    expect(useUserCounts).toHaveBeenCalledWith();
    expect(useSettingsSummary).toHaveBeenCalledWith();
  });

  it('greets by first name and shows the four counts', () => {
    mockData();
    render(<AdminDashboard />);

    expect(screen.getByRole('heading', { level: 1, name: 'Hola, Marta' })).toBeInTheDocument();
    expect(screen.getByText('Sucursales activas').previousSibling).toHaveTextContent('2');
    expect(screen.getByText('Personal activo').previousSibling).toHaveTextContent('3');
    expect(screen.getByText('Invitación pendiente').previousSibling).toHaveTextContent('1');
    expect(screen.getByText('Depreciación por km').previousSibling).toHaveTextContent(/Q\s?1\.25/);
  });

  it('keeps the labels in agreement with the counts', () => {
    mockData({
      branches: { active: 1, inactive: 0 },
      staff: { ACTIVE: 0, PENDING: 2, INACTIVE: 0 },
    });
    render(<AdminDashboard />);

    expect(screen.getByText('Sucursal activa').previousSibling).toHaveTextContent('1');
    expect(screen.getByText('Invitaciones pendientes').previousSibling).toHaveTextContent('2');
    expect(screen.queryByText('Sucursales activas')).not.toBeInTheDocument();
  });

  it('has no primary button when everything is set up', () => {
    mockData();
    render(<AdminDashboard />);

    expect(screen.queryByText('Falta la configuración')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Definir configuración' })).not.toBeInTheDocument();
  });

  it('warns when the settings are missing and offers the one primary action', () => {
    mockData({ summary: { current: null, upcoming: null } });
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
