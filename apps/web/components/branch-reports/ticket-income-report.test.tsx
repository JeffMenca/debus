import type { BranchTicketIncomePage, BranchTicketIncomeRow } from '@debus/contracts';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useBusesPage } from '../../hooks/use-buses';
import { useReport } from '../../hooks/use-report';
import { useReportPdf } from '../../hooks/use-report-pdf';
import { useRoutesPage } from '../../hooks/use-routes';
import { formatDateTime, formatQuetzales } from '../../lib/format';
import { bus, busPage, route, routePage } from '../../test-support/fleet';
import { TicketIncomeReport } from './ticket-income-report';

jest.mock('../../hooks/use-report');
jest.mock('../../hooks/use-report-pdf');
jest.mock('../../hooks/use-buses');
jest.mock('../../hooks/use-routes');
jest.mock('../../hooks/use-own-branch', () => ({
  useOwnBranch: () => ({ id: 'br', name: 'Quetzaltenango' }),
}));
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/reportes/ingresos-boletos',
  useSearchParams: () => new URLSearchParams(search),
}));

// The currency format of the browser separates the symbol with a no-break space.
const money = (value: number) => formatQuetzales(value).replace(/\s/g, ' ');

const user = userEvent.setup({ applyAccept: false });
const BUS_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const GUATEMALA = 'a3b6e7d4-2c1f-4d0e-8b7a-0e5f4c3d2b1a';
const ANTIGUA = 'b4c7f8e5-3d2a-4e1f-9c8b-1f6a5d4e3c2b';

const row = (over: Partial<BranchTicketIncomeRow> = {}): BranchTicketIncomeRow => ({
  tripId: 't1',
  departureAt: '2026-10-20T17:30:00.000Z',
  routeId: GUATEMALA,
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  busId: BUS_ID,
  busPlate: 'C482BTX',
  tickets: 3,
  onlineTickets: 2,
  counterTickets: 1,
  income: 255,
  ...over,
});

const answer = (
  items: BranchTicketIncomeRow[],
  { total = items.length, empty = false }: { total?: number; empty?: boolean } = {},
): BranchTicketIncomePage => ({
  items,
  total,
  page: 1,
  pageSize: 20,
  summary: {
    totals: { trips: 4, tickets: 14, income: 1190.5 },
    groups: empty
      ? []
      : [
          {
            routeId: GUATEMALA,
            originLabel: 'Quetzaltenango',
            destinationLabel: 'Guatemala',
            tickets: 8,
            income: 700,
          },
          {
            routeId: ANTIGUA,
            originLabel: 'Quetzaltenango',
            destinationLabel: 'Antigua Guatemala',
            tickets: 6,
            income: 490.5,
          },
        ],
  },
});

const exportPdf = jest.fn();
function setup({
  data = answer([
    row(),
    row({ tripId: 't2', busId: 'b2', busPlate: null, routeId: ANTIGUA, income: 300 }),
  ]),
  address = '',
  error = false,
  pending = false,
  placeholder = false,
}: {
  data?: BranchTicketIncomePage;
  address?: string;
  error?: boolean;
  pending?: boolean;
  placeholder?: boolean;
} = {}) {
  search = address;
  const refetch = jest.fn();
  jest.mocked(useBusesPage).mockReturnValue({
    data: busPage([bus({ id: BUS_ID, plate: 'C482BTX' })]),
  } as never);
  jest.mocked(useRoutesPage).mockReturnValue({
    data: routePage([
      route({ id: GUATEMALA }),
      route({ id: ANTIGUA, destinationName: 'Antigua Guatemala' }),
    ]),
  } as never);
  jest.mocked(useReport).mockReturnValue({
    data: error || pending ? undefined : data,
    isPending: pending,
    isError: error,
    isPlaceholderData: placeholder,
    refetch,
  } as never);
  jest.mocked(useReportPdf).mockReturnValue({ exportPdf, exporting: false });
  render(<TicketIncomeReport />);
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

describe('TicketIncomeReport', () => {
  it('names the report and the branch and has a single primary button', () => {
    setup();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Ingresos por boletos' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/· Quetzaltenango/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toHaveClass('bg-primary');
  });

  it('asks the report for the query of the address', () => {
    setup({
      address: `desde=2026-10-01&hasta=2026-10-13&ruta=${GUATEMALA}&bus=${BUS_ID}&pagina=2`,
    });

    const [path, params] = jest.mocked(useReport).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/branch-ticket-income');
    expect(params.toString()).toBe(
      `busId=${BUS_ID}&from=2026-10-01&page=2&pageSize=20&routeId=${GUATEMALA}&to=2026-10-13`,
    );
  });

  it('lists each trip with its departure, route, bus and tickets by channel', () => {
    setup();

    const table = screen.getByRole('table', { name: 'Ingresos por boletos' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Salida', 'Ruta', 'Bus', 'Boletos', 'En línea', 'Ventanilla', 'Ingreso']);
    const first = within(screen.getByRole('row', { name: /C-482BTX/ }));
    expect(
      first.getByText(formatDateTime('2026-10-20T17:30:00.000Z').replace(/\s/g, ' ')),
    ).toBeInTheDocument();
    expect(first.getByText('Quetzaltenango → Guatemala')).toBeInTheDocument();
    expect(first.getByText('C-482BTX')).toHaveClass('font-mono');
    expect(first.getByText('3')).toBeInTheDocument();
    expect(first.getByText('2')).toBeInTheDocument();
    expect(first.getByText('1')).toBeInTheDocument();
    expect(first.getByText(money(255))).toBeInTheDocument();
  });

  it('names a bus it knows nothing about', () => {
    setup();

    expect(screen.getByText('Bus sin datos')).toBeInTheDocument();
  });

  it('highlights the trips, the tickets and the income of the whole filter', () => {
    setup();

    const highlights = within(screen.getByRole('region', { name: 'Resumen del reporte' }));
    expect(highlights.getByText('Viajes')).toBeInTheDocument();
    expect(highlights.getByText('Boletos')).toBeInTheDocument();
    expect(highlights.getByText('14')).toBeInTheDocument();
    expect(highlights.getByText('Ingresos')).toBeInTheDocument();
    expect(highlights.getByText(money(1190.5))).toBeInTheDocument();
  });

  it('shows the income of each route as bars', () => {
    setup();
    const bars = within(
      screen.getByRole('heading', { name: 'Ingresos por ruta' }).closest('section')!,
    );

    expect(bars.getByText('Quetzaltenango → Guatemala')).toBeInTheDocument();
    expect(bars.getByText(money(700))).toBeInTheDocument();
    expect(bars.getByText('Quetzaltenango → Antigua Guatemala')).toBeInTheDocument();
  });

  it('leaves the bars out when there is no income', () => {
    setup({ data: answer([], { total: 0, empty: true }) });

    expect(screen.queryByRole('heading', { name: 'Ingresos por ruta' })).not.toBeInTheDocument();
  });

  it('starts with every record, route and bus and writes the applied period in the address', async () => {
    setup({ address: 'pagina=3' });
    expect(screen.getByRole('button', { name: /Periodo/ })).toHaveTextContent(
      'Todos los registros',
    );
    expect(screen.getByRole('combobox', { name: 'Ruta' })).toHaveTextContent('Todas las rutas');
    expect(screen.getByRole('combobox', { name: 'Bus' })).toHaveTextContent('Todos los buses');

    await user.click(screen.getByRole('button', { name: /Periodo/ }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-13' } });
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    const { path, params } = lastAddress();
    expect(path).toBe('/sucursal/reportes/ingresos-boletos');
    expect(params.get('desde')).toBe('2026-10-01');
    expect(params.get('hasta')).toBe('2026-10-13');
    expect(params.has('pagina')).toBe(false);
  });

  it('writes the route filter in the address and goes back to the first page', async () => {
    setup({ address: 'pagina=2' });

    await user.click(screen.getByRole('combobox', { name: 'Ruta' }));
    await user.click(
      await screen.findByRole('option', { name: 'Quetzaltenango → Antigua Guatemala' }),
    );

    const { params } = lastAddress();
    expect(params.get('ruta')).toBe(ANTIGUA);
    expect(params.has('pagina')).toBe(false);
  });

  it('clears the route filter with "all"', async () => {
    setup({ address: `ruta=${GUATEMALA}` });

    await user.click(screen.getByRole('combobox', { name: 'Ruta' }));
    await user.click(await screen.findByRole('option', { name: 'Todas las rutas' }));

    expect(lastAddress().params.has('ruta')).toBe(false);
  });

  it('writes the bus filter in the address', async () => {
    setup();

    await user.click(screen.getByRole('combobox', { name: 'Bus' }));
    await user.click(await screen.findByRole('option', { name: 'C-482BTX' }));

    expect(lastAddress().params.get('bus')).toBe(BUS_ID);
  });

  it('asks for the lists of the selects with every route and bus, open or not', () => {
    setup();

    expect(useRoutesPage).toHaveBeenCalledWith(expect.objectContaining({ status: 'all' }));
    expect(useBusesPage).toHaveBeenCalledWith(expect.objectContaining({ status: 'all' }));
  });

  it('clears the period, the route and the bus together', async () => {
    setup({ address: `desde=2026-10-01&ruta=${GUATEMALA}&bus=${BUS_ID}&pagina=2` });

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(lastAddress().params.toString()).toBe('');
  });

  it('offers no clearing when nothing narrows the report', () => {
    setup();

    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it('exports with the same filters the table has', async () => {
    setup({ address: `desde=2026-10-01&ruta=${GUATEMALA}&bus=${BUS_ID}` });

    await user.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    expect(exportPdf).toHaveBeenCalledTimes(1);
    const [path, params, stem] = jest.mocked(useReportPdf).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/branch-ticket-income');
    expect(params.get('from')).toBe('2026-10-01');
    expect(params.get('routeId')).toBe(GUATEMALA);
    expect(params.get('busId')).toBe(BUS_ID);
    expect(stem).toBe('reporte-ingresos-boletos');
  });

  it('explains an empty report in a period, and a branch that has sold nothing', () => {
    setup({ data: answer([], { total: 0, empty: true }), address: 'desde=2026-10-01' });
    expect(screen.getByText('No hay ingresos por boletos en ese periodo.')).toBeInTheDocument();
  });

  it('explains an empty report under the route and bus filters', () => {
    setup({ data: answer([], { total: 0, empty: true }), address: `bus=${BUS_ID}` });
    expect(screen.getByText('No hay ingresos por boletos con esos filtros.')).toBeInTheDocument();
  });

  it('explains a branch without ticket sales', () => {
    setup({ data: answer([], { total: 0, empty: true }) });
    expect(screen.getByText('Aún no hay boletos vendidos en tu sucursal.')).toBeInTheDocument();
  });

  it('says that the trips that were deleted are not income', () => {
    setup();

    expect(
      screen.getByText('No incluye boletos de viajes eliminados: se reembolsan.'),
    ).toBeInTheDocument();
  });

  it('shows the skeleton while it loads', () => {
    setup({ pending: true });

    expect(screen.getAllByLabelText('Cargando').length).toBeGreaterThan(0);
  });

  it('dims the table while the next page arrives', () => {
    setup({ placeholder: true });

    expect(
      screen.getByRole('table', { name: 'Ingresos por boletos' }).closest('section'),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('says it could not load the report and tries again on request', async () => {
    const { refetch } = setup({ error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el reporte.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });
});
