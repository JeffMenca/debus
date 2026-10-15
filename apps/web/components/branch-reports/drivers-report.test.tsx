import type { BranchDriverRow, BranchDriversPage } from '@debus/contracts';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReport } from '../../hooks/use-report';
import { useReportPdf } from '../../hooks/use-report-pdf';
import { DEBOUNCE_MS, startFakeClock } from '../../test-support/fake-clock';
import { DriversReport } from './drivers-report';

jest.mock('../../hooks/use-report');
jest.mock('../../hooks/use-report-pdf');
jest.mock('../../hooks/use-own-branch', () => ({
  useOwnBranch: () => ({ id: 'br', name: 'Quetzaltenango' }),
}));
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/reportes/choferes',
  useSearchParams: () => new URLSearchParams(search),
}));

const user = userEvent.setup({ applyAccept: false });

const row = (over: Partial<BranchDriverRow> = {}): BranchDriverRow => ({
  driverId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  licenseNumber: 'A1234567',
  fullName: 'Ana Pérez',
  licenseType: 'B',
  licenseExpiresOn: '2099-03-01',
  active: true,
  completedTrips: 7,
  ...over,
});

const answer = (
  items: BranchDriverRow[],
  { total = items.length, drivers = total }: { total?: number; drivers?: number } = {},
): BranchDriversPage => ({
  items,
  total,
  page: 1,
  pageSize: 20,
  summary: {
    totals: { drivers, completedTrips: 31 },
    groups: [
      { active: true, drivers: 5 },
      { active: false, drivers: 2 },
    ],
  },
});

const exportPdf = jest.fn();
function setup({
  data = answer([
    row(),
    row({
      driverId: 'd2',
      fullName: 'José Núñez',
      licenseNumber: 'C7654321',
      licenseType: 'C',
      licenseExpiresOn: '2020-01-15',
      active: false,
      completedTrips: 0,
    }),
  ]),
  address = '',
  error = false,
  pending = false,
  placeholder = false,
}: {
  data?: BranchDriversPage;
  address?: string;
  error?: boolean;
  pending?: boolean;
  placeholder?: boolean;
} = {}) {
  search = address;
  const refetch = jest.fn();
  jest.mocked(useReport).mockReturnValue({
    data: error || pending ? undefined : data,
    isPending: pending,
    isError: error,
    isPlaceholderData: placeholder,
    refetch,
  } as never);
  jest.mocked(useReportPdf).mockReturnValue({ exportPdf, exporting: false });
  render(<DriversReport />);
  return { refetch };
}

const lastAddress = () => {
  const [url] = replace.mock.calls.at(-1) as [string];
  const [path, query = ''] = url.split('?');
  return { path, params: new URLSearchParams(query) };
};

beforeEach(() => {
  replace.mockReset();
  exportPdf.mockReset();
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});
afterEach(() => jest.useRealTimers());

describe('DriversReport', () => {
  it('names the report and the branch and has a single primary button', () => {
    setup();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Listado de choferes' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Quetzaltenango/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toHaveClass('bg-primary');
  });

  it('asks the report for the query of the address', () => {
    setup({ address: 'estado=inactivos&pagina=2' });

    const [path, params] = jest.mocked(useReport).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/branch-drivers');
    expect(params.toString()).toBe('page=2&pageSize=20&status=inactive');
  });

  it('counts the drivers of each state in its tab, with everything in the first', () => {
    setup();

    const tabs = within(screen.getByRole('tablist', { name: 'Estado de los choferes' }));
    expect(tabs.getByRole('tab', { name: /Todos/ })).toHaveTextContent('7');
    expect(tabs.getByRole('tab', { name: /Activos/ })).toHaveTextContent('5');
    expect(tabs.getByRole('tab', { name: /Inactivos/ })).toHaveTextContent('2');
  });

  it('lists the columns of the report with the state of each licence', () => {
    setup();

    const table = screen.getByRole('table', { name: 'Choferes' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Licencia', 'Nombre completo', 'Tipo', 'Vence', 'Estado', 'Viajes realizados']);
    const first = within(screen.getByRole('row', { name: /Ana Pérez/ }));
    expect(first.getByText('A1234567')).toHaveClass('font-mono');
    expect(first.getByText('B')).toBeInTheDocument();
    expect(first.getByText(/Vence el/)).toBeInTheDocument();
    expect(first.getByText('Activo')).toBeInTheDocument();
    expect(first.getByText('7')).toBeInTheDocument();
    const second = within(screen.getByRole('row', { name: /José Núñez/ }));
    expect(second.getByText(/Venció hace/)).toBeInTheDocument();
    expect(second.getByText('Inactivo')).toBeInTheDocument();
  });

  it('highlights the drivers and the trips of the whole filter', () => {
    setup({ data: answer([row()], { total: 8, drivers: 8 }) });

    const highlights = within(screen.getByRole('region', { name: 'Resumen del reporte' }));
    expect(highlights.getByText('Choferes')).toBeInTheDocument();
    expect(highlights.getByText('8')).toBeInTheDocument();
    expect(highlights.getByText('Viajes realizados')).toBeInTheDocument();
    expect(highlights.getByText('31')).toBeInTheDocument();
  });

  it('writes the state in the address and goes back to the first page', async () => {
    setup({ address: 'pagina=3' });

    await user.click(screen.getByRole('tab', { name: /Inactivos/ }));

    const { path, params } = lastAddress();
    expect(path).toBe('/sucursal/reportes/choferes');
    expect(params.get('estado')).toBe('inactivos');
    expect(params.has('pagina')).toBe(false);
  });

  it('writes the search in the address after the last key', async () => {
    const clock = startFakeClock();
    setup();

    await clock.type(screen.getByRole('textbox', { name: 'Buscar' }), 'nunez');
    expect(replace).not.toHaveBeenCalled();
    await clock.elapse(DEBOUNCE_MS);

    expect(lastAddress().params.get('buscar')).toBe('nunez');
  });

  it('clears the state and the search together', async () => {
    setup({ address: 'estado=inactivos&buscar=nunez&pagina=2' });

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(lastAddress().params.toString()).toBe('');
  });

  it('offers no clearing when nothing narrows the list', () => {
    setup();

    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it('exports with the same search the table has', async () => {
    setup({ address: 'estado=activos' });

    await user.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    expect(exportPdf).toHaveBeenCalledTimes(1);
    const [path, params, stem] = jest.mocked(useReportPdf).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/branch-drivers');
    expect(params.get('status')).toBe('active');
    expect(stem).toBe('reporte-choferes');
  });

  it('explains an empty list, with and without filters', () => {
    setup({ data: answer([], { total: 0 }), address: 'estado=inactivos' });
    expect(screen.getByText('No hay choferes con esos filtros.')).toBeInTheDocument();
  });

  it('explains a branch without drivers', () => {
    setup({ data: answer([], { total: 0 }) });
    expect(screen.getByText('Aún no hay choferes registrados en tu sucursal.')).toBeInTheDocument();
  });

  it('shows the skeleton while it loads', () => {
    setup({ pending: true });

    expect(screen.getAllByLabelText('Cargando').length).toBeGreaterThan(0);
  });

  it('dims the table while the next page arrives', () => {
    setup({ placeholder: true });

    expect(screen.getByRole('table', { name: 'Choferes' }).closest('section')).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('says it could not load the report and tries again on request', async () => {
    const { refetch } = setup({ error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el reporte.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });

  it('keeps the search box in step with the address', () => {
    setup({ address: 'buscar=nunez' });

    expect(screen.getByRole('textbox', { name: 'Buscar' })).toHaveValue('nunez');
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar' }), {
      target: { value: 'perez' },
    });
    expect(screen.getByRole('textbox', { name: 'Buscar' })).toHaveValue('perez');
  });
});
