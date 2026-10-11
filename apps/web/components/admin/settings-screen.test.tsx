import { todayInGuatemala } from '@debus/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCreateSettings, useSettings } from '../../hooks/use-settings';
import { SettingsScreen } from './settings-screen';

jest.mock('../../hooks/use-settings');
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));

const version = (id: string, effectiveFrom: string, depreciation: number, createdAt: string) => ({
  id,
  depreciationPerKm: depreciation,
  rentalRatePerKm: 12,
  effectiveFrom,
  createdAt,
  createdByName: id === 'old' ? null : 'Marta Ruiz',
});

function setup(settings: unknown, { error = false, loading = false } = {}) {
  const refetch = jest.fn();
  jest.mocked(useSettings).mockReturnValue({
    data: error || loading ? undefined : settings,
    isPending: loading,
    isError: error,
    refetch,
  } as never);
  jest.mocked(useCreateSettings).mockReturnValue({ mutateAsync: jest.fn() } as never);
  render(<SettingsScreen />);
  return { refetch };
}

describe('SettingsScreen', () => {
  it('shows the amounts in force, the next change and the history with its three states', () => {
    const current = version('now', todayInGuatemala(), 1.25, '2026-10-10T15:00:00.000Z');
    const scheduled = version('soon', '2099-01-01', 1.5, '2026-10-10T16:00:00.000Z');
    const old = version('old', '2020-01-01', 1, '2020-01-01T10:00:00.000Z');
    setup({ current, versions: [scheduled, current, old] });

    expect(screen.getByRole('heading', { level: 1, name: 'Configuración' })).toBeInTheDocument();
    const depreciation = screen
      .getByText('Depreciación por kilómetro', { selector: 'h2' })
      .closest('section')!;
    expect(depreciation).toHaveTextContent(/Q\s?1\.25/);
    expect(depreciation).toHaveTextContent('Vigente desde el');
    expect(screen.getByText(/cambia a/)).toHaveTextContent(/Q\s?1\.50 por km de depreciación/);

    const history = screen.getByRole('table', { name: 'Historial de configuración' });
    expect(within(history).getByText('Vigente')).toBeInTheDocument();
    expect(within(history).getByText('Programado')).toBeInTheDocument();
    expect(within(history).getByText('Anterior')).toBeInTheDocument();
    expect(within(history).getAllByText('Marta Ruiz')).toHaveLength(2);
    expect(within(history).getByText('—')).toBeInTheDocument();
  });

  it('says the amounts are not defined yet', () => {
    setup({ current: null, versions: [] });

    expect(screen.getAllByText('Sin definir')).toHaveLength(2);
    expect(
      screen.getByText('Define los montos para poder calcular los costos de los viajes.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Todavía no hay cambios registrados.')).toBeInTheDocument();
    expect(screen.queryByText(/cambia a/)).not.toBeInTheDocument();
  });

  it('has a single primary button, the one that saves', () => {
    setup({ current: null, versions: [] });

    expect(screen.getByRole('button', { name: 'Guardar cambio' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('shows placeholders while loading', () => {
    setup(undefined, { loading: true });

    expect(screen.getByLabelText('Cargando')).toBeInTheDocument();
  });

  it('shows a friendly error with a retry', async () => {
    const { refetch } = setup(undefined, { error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar la configuración.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });
});
