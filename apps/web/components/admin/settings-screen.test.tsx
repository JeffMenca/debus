import { todayInGuatemala } from '@debus/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCreateSettings, useSettingsPage, useSettingsSummary } from '../../hooks/use-settings';
import { SettingsScreen } from './settings-screen';

jest.mock('../../hooks/use-settings');
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/admin/configuracion',
  useSearchParams: () => new URLSearchParams(search),
}));

const version = (id: string, effectiveFrom: string, depreciation: number, createdAt: string) => ({
  id,
  depreciationPerKm: depreciation,
  rentalRatePerKm: 12,
  effectiveFrom,
  createdAt,
  createdByName: id === 'old' ? null : 'Marta Ruiz',
});

interface Scenario {
  current: unknown;
  upcoming?: unknown;
  items?: unknown[];
  total?: number;
  page?: number;
  address?: string;
  error?: boolean;
  loading?: boolean;
  historyError?: boolean;
  refreshing?: boolean;
}

function setup({
  current,
  upcoming = null,
  items = [],
  total = items.length,
  page = 1,
  address = '',
  error = false,
  loading = false,
  historyError = false,
  refreshing = false,
}: Scenario) {
  search = address;
  const refetch = jest.fn();
  const refetchHistory = jest.fn();
  jest.mocked(useSettingsSummary).mockReturnValue({
    data: error || loading ? undefined : { current, upcoming },
    isPending: loading,
    isError: error,
    refetch,
  } as never);
  jest.mocked(useSettingsPage).mockReturnValue({
    data: historyError
      ? undefined
      : { items, total, page, pageSize: 20, summary: { current, upcoming } },
    isPending: false,
    isError: historyError,
    isPlaceholderData: refreshing,
    refetch: refetchHistory,
  } as never);
  jest.mocked(useCreateSettings).mockReturnValue({ mutateAsync: jest.fn() } as never);
  render(<SettingsScreen />);
  return { refetch, refetchHistory };
}

const lastAddress = () => {
  const [url] = replace.mock.calls.at(-1) as [string];
  const [path, query = ''] = url.split('?');
  return { path, params: new URLSearchParams(query) };
};

beforeEach(() => replace.mockReset());

describe('SettingsScreen', () => {
  it('shows the amounts in force, the next change and the history with its three states', () => {
    const current = version('now', todayInGuatemala(), 1.25, '2026-10-10T15:00:00.000Z');
    const scheduled = version('soon', '2099-01-01', 1.5, '2026-10-10T16:00:00.000Z');
    const old = version('old', '2020-01-01', 1, '2020-01-01T10:00:00.000Z');
    setup({ current, upcoming: scheduled, items: [scheduled, current, old] });

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

  it('shows the current and next versions even when the history page does not hold them', () => {
    const current = version('now', todayInGuatemala(), 1.25, '2026-10-10T15:00:00.000Z');
    const scheduled = version('soon', '2099-01-01', 1.5, '2026-10-10T16:00:00.000Z');
    const old = version('old', '2020-01-01', 1, '2020-01-01T10:00:00.000Z');
    setup({ current, upcoming: scheduled, items: [old], total: 25, page: 2, address: 'pagina=2' });

    expect(useSettingsPage).toHaveBeenCalledWith({ page: 2, pageSize: 20 });
    expect(screen.getByText(/cambia a/)).toBeInTheDocument();
    expect(screen.getAllByText(/Q\s?1\.25/).length).toBeGreaterThan(0);
    const history = screen.getByRole('table', { name: 'Historial de configuración' });
    expect(within(history).getByText('Anterior')).toBeInTheDocument();
    expect(within(history).queryByText('Vigente')).not.toBeInTheDocument();
  });

  it('pages the history and writes the page in the address', async () => {
    const current = version('now', todayInGuatemala(), 1.25, '2026-10-10T15:00:00.000Z');
    setup({ current, items: [current], total: 25, refreshing: true });

    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

    const { path, params } = lastAddress();
    expect(path).toBe('/admin/configuracion');
    expect(params.get('pagina')).toBe('2');
  });

  it('sends the person back to the last page when the one they asked for is empty', () => {
    setup({ current: null, items: [], total: 25, page: 9, address: 'pagina=9' });

    expect(lastAddress().params.get('pagina')).toBe('2');
  });

  it('retries only the history when it fails', async () => {
    const { refetchHistory } = setup({ current: null, historyError: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el historial.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetchHistory).toHaveBeenCalled();
  });

  it('says the amounts are not defined yet', () => {
    setup({ current: null });

    expect(screen.getAllByText('Sin definir')).toHaveLength(2);
    expect(
      screen.getByText('Define los montos para poder calcular los costos de los viajes.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Todavía no hay cambios registrados.')).toBeInTheDocument();
    expect(screen.queryByText(/cambia a/)).not.toBeInTheDocument();
  });

  it('has a single primary button, the one that saves', () => {
    setup({ current: null });

    expect(screen.getByRole('button', { name: 'Guardar cambio' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('shows placeholders while loading', () => {
    setup({ current: null, loading: true });

    expect(screen.getByLabelText('Cargando')).toBeInTheDocument();
  });

  it('shows a friendly error with a retry', async () => {
    const { refetch } = setup({ current: null, error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar la configuración.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });
});
