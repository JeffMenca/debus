import type { SystemRoutesMap } from '@debus/contracts';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { useReportPdf } from '../../hooks/use-report-pdf';
import { useSystemRoutesMap } from '../../hooks/use-system-routes-map';
import {
  BRANCH_IDS,
  lastAddress,
  reportState,
  stubReducedMotion,
} from '../../test-support/system-reports';
import { RoutesMapReport } from './routes-map-report';

jest.mock('../../hooks/use-system-routes-map');
jest.mock('../../hooks/use-report-pdf');
jest.mock('next/dynamic', () => {
  const calls: unknown[] = [];
  const dynamic = (_loader: unknown, options: unknown) => {
    calls.push(options);
    return function FakeCanvas(props: { selectedBranchId: string | null; routes: unknown[] }) {
      return (
        <div data-testid="canvas">{`origen ${props.selectedBranchId} con ${props.routes.length} rutas`}</div>
      );
    };
  };
  dynamic.calls = calls;
  return dynamic;
});
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/admin/reportes/mapa-rutas',
  useSearchParams: () => new URLSearchParams(search),
}));

const user = userEvent.setup({ applyAccept: false });
const HUEHUE = 'ab0e6679-7425-40de-944b-e07fc1f90ae7';

const map = (over: Partial<SystemRoutesMap> = {}): SystemRoutesMap => ({
  branches: [
    {
      id: BRANCH_IDS.xela,
      name: 'Quetzaltenango',
      latitude: 14.8347,
      longitude: -91.518,
      routes: 1,
    },
    { id: BRANCH_IDS.coban, name: 'Cobán', latitude: 15.47, longitude: -90.37, routes: 0 },
    { id: HUEHUE, name: 'Huehuetenango', latitude: 15.3197, longitude: -91.471, routes: 2 },
  ],
  selectedBranchId: BRANCH_IDS.xela,
  routes: [
    {
      routeId: '7c9e6679-7425-40de-944b-e07fc1f90ae1',
      destinationBranchId: HUEHUE,
      destinationName: 'Huehuetenango',
      latitude: 15.3197,
      longitude: -91.471,
      distanceKm: 90,
      ticketPrice: 45,
      tickets: 236,
    },
  ],
  ...over,
});

const exportPdf = jest.fn();
function setup({
  data = map(),
  address = '',
  error = false,
  pending = false,
}: { data?: SystemRoutesMap; address?: string; error?: boolean; pending?: boolean } = {}) {
  search = address;
  const refetch = jest.fn();
  jest.mocked(useSystemRoutesMap).mockReturnValue(reportState({ data, error, pending, refetch }));
  jest.mocked(useReportPdf).mockReturnValue({ exportPdf, exporting: false });
  render(<RoutesMapReport />);
  return { refetch };
}

beforeEach(() => {
  replace.mockReset();
  exportPdf.mockReset();
  stubReducedMotion();
});

describe('RoutesMapReport', () => {
  it('names the report and has a single primary button', () => {
    setup();

    expect(screen.getByRole('heading', { level: 1, name: 'Mapa de rutas' })).toBeInTheDocument();
    expect(screen.getByText('Reportes · rutas por sucursal de origen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toHaveClass('bg-primary');
  });

  it('asks for the branch of the address and leaves the choice to the server without one', () => {
    setup({ address: `sucursal=${BRANCH_IDS.coban}` });
    expect(useSystemRoutesMap).toHaveBeenLastCalledWith(BRANCH_IDS.coban);

    setup();
    expect(useSystemRoutesMap).toHaveBeenLastCalledWith(undefined);
  });

  it('loads the map of Guatemala in the browser only, with a message while it comes', () => {
    setup();

    const [options] = (jest.requireMock('next/dynamic') as { calls: unknown[] }).calls;
    expect(options).toEqual(expect.objectContaining({ ssr: false }));
    const { loading: Loading } = options as { loading: () => ReactElement };
    render(<Loading />);
    expect(screen.getByText('Cargando mapa de Guatemala')).toBeInTheDocument();
  });

  it('gives the canvas the branches and the routes of the chosen one inside a labelled region', () => {
    setup();

    const region = screen.getByRole('region', { name: 'Mapa de Guatemala' });
    expect(within(region).getByTestId('canvas')).toHaveTextContent(
      `origen ${BRANCH_IDS.xela} con 1 rutas`,
    );
  });

  it('explains the symbols of the map, and says the bus is an example', () => {
    setup();

    const legend = within(screen.getByRole('region', { name: 'Mapa de Guatemala' }));
    expect(legend.getByText('Sucursal de origen')).toBeInTheDocument();
    expect(legend.getByText('Destino con ruta')).toBeInTheDocument();
    expect(legend.getByText('Bus de ejemplo')).toBeInTheDocument();
  });

  it('lists the routes of the branch in the panel, with their count', () => {
    setup();

    expect(screen.getByRole('heading', { level: 2, name: 'Quetzaltenango' })).toBeInTheDocument();
    expect(screen.getByText('1 ruta activa')).toBeInTheDocument();
    expect(screen.getByText('90 km · 236 boletos vendidos')).toBeInTheDocument();
  });

  it('counts the active routes of the branch, even those that cannot be drawn', () => {
    setup({ data: map({ selectedBranchId: HUEHUE }) });

    expect(screen.getByText('2 rutas activas')).toBeInTheDocument();
    expect(screen.getByText(/no aparece/)).toBeInTheDocument();
  });

  it('lets the person choose the branch the routes start from and writes it in the address', async () => {
    setup();

    expect(screen.getByRole('tab', { name: 'Quetzaltenango' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('tab', { name: 'Cobán' }));

    expect(lastAddress(replace).params.get('sucursal')).toBe(BRANCH_IDS.coban);
  });

  it('shows the branch of the address as chosen right away, while its map arrives', () => {
    setup({ address: `sucursal=${BRANCH_IDS.coban}` });

    expect(screen.getByRole('tab', { name: 'Cobán' })).toHaveAttribute('aria-selected', 'true');
  });

  it('says so when the chosen branch has no routes', () => {
    setup({ data: map({ selectedBranchId: BRANCH_IDS.coban, routes: [] }) });

    expect(screen.getByText('0 rutas activas')).toBeInTheDocument();
    expect(screen.getByText('Esta sucursal aún no tiene rutas activas')).toBeInTheDocument();
  });

  it('says so when no branch has routes at all', () => {
    setup({ data: map({ selectedBranchId: null, routes: [] }) });

    expect(
      screen.getByText('Todavía no hay rutas activas en ninguna sucursal'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('canvas')).toHaveTextContent('origen null con 0 rutas');
  });

  it('names a branch of the address that the map does not know', () => {
    setup({ data: map({ selectedBranchId: '1c0e6679-7425-40de-944b-e07fc1f90ae7', routes: [] }) });

    expect(
      screen.getByRole('heading', { level: 2, name: 'Sucursal sin datos' }),
    ).toBeInTheDocument();
  });

  it('exports the table of routes of the branch that is on screen, with no page', async () => {
    setup();

    await user.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    const [path, params, stem] = jest.mocked(useReportPdf).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/system-routes-map');
    expect(params.toString()).toBe(`branchId=${BRANCH_IDS.xela}`);
    expect(stem).toBe('reporte-mapa-rutas');
    expect(exportPdf).toHaveBeenCalledTimes(1);
  });

  it('shows a skeleton while the map loads and does not offer the PDF yet', () => {
    setup({ pending: true });

    expect(screen.getByText('Cargando mapa de Guatemala')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeDisabled();
    expect(screen.queryByTestId('canvas')).not.toBeInTheDocument();
  });

  it('says it could not load the map and tries again on request', async () => {
    const { refetch } = setup({ error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el mapa.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });
});
