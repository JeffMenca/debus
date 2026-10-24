import type { SystemMapRoute } from '@debus/contracts';
import { render, screen, within } from '@testing-library/react';
import { formatQuetzales } from '../../lib/format';
import { plain } from '../../test-support/system-reports';
import { RoutesMapPanel } from './routes-map-panel';

const money = (value: number) => plain(formatQuetzales(value));

const route = (over: Partial<SystemMapRoute> = {}): SystemMapRoute => ({
  routeId: '7c9e6679-7425-40de-944b-e07fc1f90ae1',
  destinationBranchId: '9a0e6679-7425-40de-944b-e07fc1f90ae7',
  destinationName: 'Ciudad de Guatemala',
  latitude: 14.6349,
  longitude: -90.5069,
  distanceKm: 201,
  ticketPrice: 85,
  tickets: 412,
  ...over,
});

const routes = [
  route(),
  route({
    routeId: '7c9e6679-7425-40de-944b-e07fc1f90ae2',
    destinationName: 'Huehuetenango',
    distanceKm: 90.5,
    ticketPrice: 45,
    tickets: 1,
  }),
];

describe('RoutesMapPanel', () => {
  it('says where the routes start from and how many are active', () => {
    render(<RoutesMapPanel origin={{ name: 'Quetzaltenango', activeRoutes: 2 }} routes={routes} />);

    expect(screen.getByText('Desde')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Quetzaltenango' })).toBeInTheDocument();
    expect(screen.getByText('2 rutas activas')).toBeInTheDocument();
  });

  it('writes "1 ruta activa" in the singular', () => {
    render(
      <RoutesMapPanel origin={{ name: 'Quetzaltenango', activeRoutes: 1 }} routes={[route()]} />,
    );

    expect(screen.getByText('1 ruta activa')).toBeInTheDocument();
  });

  it('lists each route with its destination, its distance, its tickets and its price', () => {
    render(<RoutesMapPanel origin={{ name: 'Quetzaltenango', activeRoutes: 2 }} routes={routes} />);

    const list = within(screen.getByRole('list', { name: 'Rutas activas' }));
    const [first, second] = list.getAllByRole('listitem');
    expect(within(first!).getByText('Ciudad de Guatemala')).toBeInTheDocument();
    expect(within(first!).getByText('201 km · 412 boletos vendidos')).toBeInTheDocument();
    expect(within(first!).getByText(money(85))).toBeInTheDocument();
    expect(within(second!).getByText('90.5 km · 1 boleto vendido')).toBeInTheDocument();
  });

  it('says so when the branch has no active routes', () => {
    render(<RoutesMapPanel origin={{ name: 'Cobán', activeRoutes: 0 }} routes={[]} />);

    expect(screen.getByText('0 rutas activas')).toBeInTheDocument();
    expect(screen.getByText('Esta sucursal aún no tiene rutas activas')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Rutas activas' })).not.toBeInTheDocument();
  });

  it('says so when no branch has routes at all', () => {
    render(<RoutesMapPanel origin={null} routes={[]} />);

    expect(screen.queryByText('Desde')).not.toBeInTheDocument();
    expect(
      screen.getByText('Todavía no hay rutas activas en ninguna sucursal'),
    ).toBeInTheDocument();
  });

  it('explains why a route is missing when its destination has no place on the map yet', () => {
    render(<RoutesMapPanel origin={{ name: 'Quetzaltenango', activeRoutes: 3 }} routes={routes} />);

    expect(
      screen.getByText(
        'Alguna ruta no aparece porque su destino todavía no tiene ubicación en el mapa.',
      ),
    ).toBeInTheDocument();
  });

  it('does not say there are no routes when all of them wait for a place on the map', () => {
    render(<RoutesMapPanel origin={{ name: 'Quetzaltenango', activeRoutes: 2 }} routes={[]} />);

    expect(screen.queryByText('Esta sucursal aún no tiene rutas activas')).not.toBeInTheDocument();
    expect(screen.getByText(/no aparece/)).toBeInTheDocument();
  });

  it('keeps quiet about missing routes when every one is listed', () => {
    render(<RoutesMapPanel origin={{ name: 'Quetzaltenango', activeRoutes: 2 }} routes={routes} />);

    expect(screen.queryByText(/no aparece/)).not.toBeInTheDocument();
  });
});
