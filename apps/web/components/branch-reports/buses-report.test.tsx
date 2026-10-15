import type { BranchBusRow, BranchBusesPage } from '@debus/contracts';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReport } from '../../hooks/use-report';
import { useReportPdf } from '../../hooks/use-report-pdf';
import { DEBOUNCE_MS, startFakeClock } from '../../test-support/fake-clock';
import { BusesReport } from './buses-report';

jest.mock('../../hooks/use-report');
jest.mock('../../hooks/use-report-pdf');
jest.mock('../../hooks/use-own-branch', () => ({
  useOwnBranch: () => ({ id: 'br', name: 'Quetzaltenango' }),
}));
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/reportes/buses',
  useSearchParams: () => new URLSearchParams(search),
}));

const user = userEvent.setup({ applyAccept: false });

const row = (over: Partial<BranchBusRow> = {}): BranchBusRow => ({
  busId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  plate: 'C482BTX',
  brand: 'Volvo',
  model: 'B8R',
  capacity: 40,
  status: 'AVAILABLE',
  driverName: null,
  mileageKm: 148412,
  completedTrips: 7,
  ...over,
});

const answer = (
  items: BranchBusRow[],
  { total = items.length, buses = total }: { total?: number; buses?: number } = {},
): BranchBusesPage => ({
  items,
  total,
  page: 1,
  pageSize: 20,
  summary: {
    totals: { buses, completedTrips: 31 },
    groups: [
      { status: 'IN_TRANSIT', buses: 2 },
      { status: 'AVAILABLE', buses: 3 },
      { status: 'IN_WORKSHOP', buses: 1 },
      { status: 'INACTIVE', buses: 4 },
    ],
  },
});

const exportPdf = jest.fn();
function setup({
  data = answer([
    row(),
    row({
      busId: 'b2',
      plate: 'C731PLR',
      brand: 'Hino',
      model: 'RK8',
      status: 'IN_TRANSIT',
      driverName: 'Ana Pérez',
      mileageKm: 900,
    }),
  ]),
  address = '',
  error = false,
  pending = false,
  placeholder = false,
}: {
  data?: BranchBusesPage;
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
  render(<BusesReport />);
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

describe('BusesReport', () => {
  it('names the report and the branch and has a single primary button', () => {
    setup();

    expect(screen.getByRole('heading', { level: 1, name: 'Listado de buses' })).toBeInTheDocument();
    expect(screen.getByText(/Quetzaltenango/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toHaveClass('bg-primary');
  });

  it('asks the report for the query of the address', () => {
    setup({ address: 'estado=en-taller&pagina=2' });

    const [path, params] = jest.mocked(useReport).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/branch-buses');
    expect(params.toString()).toBe('page=2&pageSize=20&status=IN_WORKSHOP');
  });

  it('counts the buses of each status in its tab, with everything in the first', () => {
    setup();

    const tabs = within(screen.getByRole('tablist', { name: 'Estado de los buses' }));
    expect(tabs.getByRole('tab', { name: /Todos/ })).toHaveTextContent('10');
    expect(tabs.getByRole('tab', { name: /En ruta/ })).toHaveTextContent('2');
    expect(tabs.getByRole('tab', { name: /Disponibles/ })).toHaveTextContent('3');
    expect(tabs.getByRole('tab', { name: /En taller/ })).toHaveTextContent('1');
    expect(tabs.getByRole('tab', { name: /Inactivos/ })).toHaveTextContent('4');
  });

  it('lists the columns of the report', () => {
    setup();

    const table = screen.getByRole('table', { name: 'Buses' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual([
      'Placa',
      'Bus',
      'Capacidad',
      'Estado',
      'Chofer asignado',
      'Kilometraje',
      'Viajes realizados',
    ]);
    const first = within(screen.getByRole('row', { name: /C-482BTX/ }));
    expect(first.getByText('C-482BTX')).toHaveClass('font-mono');
    expect(first.getByText('Volvo B8R')).toBeInTheDocument();
    expect(first.getByText('Sin chofer')).toBeInTheDocument();
    expect(first.getByText('148,412 km')).toBeInTheDocument();
    expect(first.getByText('Disponible')).toBeInTheDocument();
    const second = within(screen.getByRole('row', { name: /C-731PLR/ }));
    expect(second.getByText('Ana Pérez')).toBeInTheDocument();
    expect(second.getByText('En ruta')).toBeInTheDocument();
  });

  it('highlights the buses and the trips of the whole filter', () => {
    setup({ data: answer([row()], { total: 8, buses: 8 }) });

    const highlights = within(screen.getByRole('region', { name: 'Resumen del reporte' }));
    expect(highlights.getByText('Buses')).toBeInTheDocument();
    expect(highlights.getByText('8')).toBeInTheDocument();
    expect(highlights.getByText('Viajes realizados')).toBeInTheDocument();
    expect(highlights.getByText('31')).toBeInTheDocument();
  });

  it('writes the status in the address and goes back to the first page', async () => {
    setup({ address: 'pagina=3' });

    await user.click(screen.getByRole('tab', { name: /En taller/ }));

    const { path, params } = lastAddress();
    expect(path).toBe('/sucursal/reportes/buses');
    expect(params.get('estado')).toBe('en-taller');
    expect(params.has('pagina')).toBe(false);
  });

  it('writes the search in the address after the last key', async () => {
    const clock = startFakeClock();
    setup();

    await clock.type(screen.getByRole('textbox', { name: 'Buscar' }), 'volvo');
    expect(replace).not.toHaveBeenCalled();
    await clock.elapse(DEBOUNCE_MS);

    expect(lastAddress().params.get('buscar')).toBe('volvo');
  });

  it('clears the status and the search together', async () => {
    setup({ address: 'estado=en-taller&buscar=volvo&pagina=2' });

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(lastAddress().params.toString()).toBe('');
  });

  it('offers no clearing when nothing narrows the list', () => {
    setup();

    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it('exports with the same search the table has', async () => {
    setup({ address: 'estado=en-taller' });

    await user.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    expect(exportPdf).toHaveBeenCalledTimes(1);
    const [path, params, stem] = jest.mocked(useReportPdf).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/branch-buses');
    expect(params.get('status')).toBe('IN_WORKSHOP');
    expect(stem).toBe('reporte-buses');
  });

  it('explains an empty list, with and without filters', () => {
    setup({ data: answer([], { total: 0 }), address: 'estado=inactivos' });
    expect(screen.getByText('No hay buses con esos filtros.')).toBeInTheDocument();
  });

  it('explains a branch without buses', () => {
    setup({ data: answer([], { total: 0 }) });
    expect(screen.getByText('Aún no hay buses registrados en tu sucursal.')).toBeInTheDocument();
  });

  it('shows the skeleton while it loads', () => {
    setup({ pending: true });

    expect(screen.getAllByLabelText('Cargando').length).toBeGreaterThan(0);
  });

  it('dims the table while the next page arrives', () => {
    setup({ placeholder: true });

    expect(screen.getByRole('table', { name: 'Buses' }).closest('section')).toHaveAttribute(
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
    setup({ address: 'buscar=volvo' });

    expect(screen.getByRole('textbox', { name: 'Buscar' })).toHaveValue('volvo');
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar' }), {
      target: { value: 'hino' },
    });
    expect(screen.getByRole('textbox', { name: 'Buscar' })).toHaveValue('hino');
  });
});
