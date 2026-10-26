import type { SystemTopRouteRow, SystemTopRoutesPage } from '@debus/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useBranchOptions } from '../../hooks/use-branches';
import { useReport } from '../../hooks/use-report';
import { useReportPdf } from '../../hooks/use-report-pdf';
import { formatQuetzales } from '../../lib/format';
import {
  BRANCH_IDS,
  branchOptions,
  lastAddress,
  plain,
  reportState,
  stubReducedMotion,
} from '../../test-support/system-reports';
import { TopRoutesReport } from './top-routes-report';

jest.mock('../../hooks/use-report');
jest.mock('../../hooks/use-report-pdf');
jest.mock('../../hooks/use-branches');
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/admin/reportes/rutas-demandadas',
  useSearchParams: () => new URLSearchParams(search),
}));

const money = (value: number) => plain(formatQuetzales(value));
const user = userEvent.setup({ applyAccept: false });

const route = (over: Partial<SystemTopRouteRow> = {}): SystemTopRouteRow => ({
  position: 1,
  routeId: '7c9e6679-7425-40de-944b-e07fc1f90ae1',
  branchId: BRANCH_IDS.xela,
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Ciudad de Guatemala',
  distanceKm: 201,
  ticketPrice: 85,
  active: true,
  trips: 12,
  onlineTickets: 300,
  counterTickets: 112,
  tickets: 412,
  income: 35020,
  share: 62.5,
  ...over,
});

const rows = [
  route(),
  route({
    position: 2,
    routeId: '7c9e6679-7425-40de-944b-e07fc1f90ae2',
    destinationLabel: 'Huehuetenango',
    distanceKm: 90,
    ticketPrice: 45,
    trips: 8,
    onlineTickets: 150,
    counterTickets: 86,
    tickets: 236,
    income: 10620,
    share: 35.8,
  }),
  route({
    position: 3,
    routeId: '7c9e6679-7425-40de-944b-e07fc1f90ae3',
    destinationLabel: 'Flores',
    distanceKm: null,
    ticketPrice: null,
    active: null,
    trips: 1,
    onlineTickets: 5,
    counterTickets: 6,
    tickets: 11,
    income: 2310,
    share: 1.7,
  }),
  route({
    position: 4,
    routeId: '7c9e6679-7425-40de-944b-e07fc1f90ae4',
    destinationLabel: 'Escuintla',
    active: false,
    tickets: 1,
    onlineTickets: 1,
    counterTickets: 0,
    trips: 1,
    income: 70,
    share: 0,
  }),
];

const answer = (
  items: SystemTopRouteRow[] = rows,
  over: Partial<SystemTopRoutesPage> = {},
): SystemTopRoutesPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  summary: { totals: { routes: 4, trips: 22, tickets: 660, income: 48020 }, groups: [] },
  ...over,
});

const exportPdf = jest.fn();
function setup({
  data = answer(),
  address = '',
  error = false,
  pending = false,
}: { data?: SystemTopRoutesPage; address?: string; error?: boolean; pending?: boolean } = {}) {
  search = address;
  const refetch = jest.fn();
  jest.mocked(useBranchOptions).mockReturnValue(branchOptions() as never);
  jest.mocked(useReport).mockReturnValue(reportState({ data, error, pending, refetch }));
  jest.mocked(useReportPdf).mockReturnValue({ exportPdf, exporting: false });
  render(<TopRoutesReport />);
  return { refetch };
}

beforeEach(() => {
  replace.mockReset();
  exportPdf.mockReset();
  stubReducedMotion();
});

describe('TopRoutesReport', () => {
  it('names the report and asks the server for the query of the address', () => {
    setup({ address: `sucursal=${BRANCH_IDS.xela}&hasta=2026-10-13` });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Rutas más demandadas' }),
    ).toBeInTheDocument();
    const [path, params] = jest.mocked(useReport).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/system-top-routes');
    expect(params.toString()).toBe(`branchId=${BRANCH_IDS.xela}&page=1&pageSize=20&to=2026-10-13`);
  });

  it('ranks the routes with their trips, their tickets by channel, their income and their share', () => {
    setup();

    const table = screen.getByRole('table', { name: 'Rutas más demandadas' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual([
      '#',
      'Ruta',
      'Viajes',
      'En línea',
      'Ventanilla',
      'Boletos',
      'Ingresos',
      'Participación',
    ]);
    const first = within(screen.getByRole('row', { name: /Ciudad de Guatemala/ }));
    expect(first.getByText('1')).toBeInTheDocument();
    expect(first.getByText('Quetzaltenango → Ciudad de Guatemala')).toBeInTheDocument();
    expect(first.getByText('201 km · ' + money(85))).toBeInTheDocument();
    expect(first.getByText('300')).toBeInTheDocument();
    expect(first.getByText('412')).toBeInTheDocument();
    expect(first.getByText(money(35020))).toBeInTheDocument();
    expect(first.getByText('62.5 %')).toBeInTheDocument();
  });

  it('does not fail on a route that has not arrived yet and says when one was turned off', () => {
    setup();

    const pending = within(screen.getByRole('row', { name: /Flores/ }));
    expect(pending.getByText('Quetzaltenango → Flores')).toBeInTheDocument();
    expect(pending.queryByText(/km/)).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('row', { name: /Escuintla/ })).getByText('Ruta desactivada'),
    ).toBeInTheDocument();
  });

  it('adds up the trips, the tickets and the income of every route at the end', () => {
    setup();

    const total = screen.getByRole('row', { name: 'Total' });
    expect(total).toBe(screen.getAllByRole('row').at(-1));
    expect(within(total).getByText('22')).toBeInTheDocument();
    expect(within(total).getByText('660')).toBeInTheDocument();
    expect(within(total).getByText(money(48020))).toBeInTheDocument();
  });

  it('highlights the routes, the trips, the tickets and the income of the whole filter', () => {
    setup();

    const highlights = within(screen.getByRole('region', { name: 'Resumen del reporte' }));
    for (const label of ['Rutas', 'Viajes', 'Boletos', 'Ingresos']) {
      expect(highlights.getByText(label)).toBeInTheDocument();
    }
    expect(highlights.getByText(money(48020))).toBeInTheDocument();
  });

  it('draws the tickets of the routes of the page as bars', () => {
    setup();

    const bars = within(
      screen
        .getByRole('heading', { name: 'Boletos de las rutas de esta página' })
        .closest('section')!,
    );
    expect(bars.getByText('Quetzaltenango → Huehuetenango')).toBeInTheDocument();
    expect(bars.getByText('236')).toBeInTheDocument();
  });

  it('names the branch of the filter as the one the routes start from', async () => {
    setup({ address: 'pagina=2' });

    await user.click(screen.getByRole('combobox', { name: 'Sucursal de origen' }));
    await user.click(await screen.findByRole('option', { name: 'Cobán' }));

    expect(lastAddress(replace).params.get('sucursal')).toBe(BRANCH_IDS.coban);
    expect(lastAddress(replace).params.has('pagina')).toBe(false);
  });

  it('exports with the same filters and no page', async () => {
    setup({ address: `desde=2026-10-01&sucursal=${BRANCH_IDS.xela}&pagina=3` });

    await user.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    const [path, params, stem] = jest.mocked(useReportPdf).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/system-top-routes');
    expect(params.toString()).toBe(`branchId=${BRANCH_IDS.xela}&from=2026-10-01`);
    expect(stem).toBe('reporte-rutas-demandadas');
    expect(exportPdf).toHaveBeenCalled();
  });

  it.each([
    ['desde=2026-10-01', 'Todavía no hay boletos vendidos en este periodo.'],
    [`sucursal=${BRANCH_IDS.coban}`, 'Esa sucursal todavía no ha vendido boletos.'],
    ['', 'Todavía no hay boletos vendidos.'],
  ])('explains an empty report (%s)', (address, message) => {
    setup({ data: answer([]), address });

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: 'Total' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Boletos de las rutas de esta página' }),
    ).not.toBeInTheDocument();
  });

  it('shows the skeleton while it loads', () => {
    setup({ pending: true });

    expect(screen.getAllByLabelText('Cargando').length).toBeGreaterThan(0);
  });

  it('says it could not load the report and tries again on request', async () => {
    const { refetch } = setup({ error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el reporte.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });
});
