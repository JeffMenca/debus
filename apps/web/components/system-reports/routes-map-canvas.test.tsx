import type { SystemMapBranch, SystemMapRoute } from '@debus/contracts';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import RoutesMapCanvas from './routes-map-canvas';

jest.mock('leaflet/dist/leaflet.css', () => ({}));
const mockMarkers: { position: [number, number]; icon: { options: { html: HTMLElement } } }[] = [];
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children, ...props }: { children: ReactNode; className?: string }) => (
    <div data-testid="map" className={props.className}>
      {children}
    </div>
  ),
  GeoJSON: () => <div data-testid="outline" />,
  ZoomControl: () => <div data-testid="zoom" />,
  AttributionControl: () => <div data-testid="attribution" />,
  Polyline: ({
    pathOptions,
    className,
    interactive,
  }: {
    pathOptions: { weight: number };
    className?: string;
    interactive?: boolean;
  }) => (
    <div
      data-testid="line"
      data-weight={pathOptions.weight}
      data-class={className}
      data-interactive={String(interactive)}
    />
  ),
  Marker: (props: (typeof mockMarkers)[number]) => {
    mockMarkers.push(props);
    return <div data-testid="marker" />;
  },
  useMap: () => ({ getContainer: () => document.body, invalidateSize: jest.fn() }),
}));
jest.mock('./example-bus', () => ({
  ExampleBus: ({ points }: { points: unknown[] }) => (
    <div data-testid="bus" data-points={points.length} />
  ),
}));

const XELA = '8f9e6679-7425-40de-944b-e07fc1f90ae7';
const GUATE = '9a0e6679-7425-40de-944b-e07fc1f90ae7';
const COBAN = 'ab0e6679-7425-40de-944b-e07fc1f90ae7';
const branches: SystemMapBranch[] = [
  { id: XELA, name: 'Quetzaltenango', latitude: 14.8347, longitude: -91.518, routes: 1 },
  { id: GUATE, name: 'Ciudad de Guatemala', latitude: 14.6349, longitude: -90.5069, routes: 0 },
  { id: COBAN, name: 'Cobán', latitude: 15.47, longitude: -90.37, routes: 0 },
];
const routes: SystemMapRoute[] = [
  {
    routeId: '7c9e6679-7425-40de-944b-e07fc1f90ae1',
    destinationBranchId: GUATE,
    destinationName: 'Ciudad de Guatemala',
    latitude: 14.6349,
    longitude: -90.5069,
    distanceKm: 201,
    ticketPrice: 85,
    tickets: 10,
  },
];

beforeEach(() => {
  mockMarkers.length = 0;
});

const labelsOf = () =>
  mockMarkers.map((marker) => marker.icon.options.html.getAttribute('aria-label')).filter(Boolean);

describe('RoutesMapCanvas', () => {
  it('draws the outline of the country with no tiles from outside, and the controls', () => {
    render(<RoutesMapCanvas branches={branches} selectedBranchId={XELA} routes={routes} />);

    expect(screen.getByTestId('outline')).toBeInTheDocument();
    expect(screen.getByTestId('zoom')).toBeInTheDocument();
    expect(screen.getByTestId('attribution')).toBeInTheDocument();
    expect(screen.queryByTestId('tiles')).not.toBeInTheDocument();
  });

  it('draws each route as a halo and a dashed line, with an example bus on it', () => {
    render(<RoutesMapCanvas branches={branches} selectedBranchId={XELA} routes={routes} />);

    const lines = screen.getAllByTestId('line');
    expect(lines.map((line) => line.getAttribute('data-weight'))).toEqual(['12', '4']);
    // Leaflet reads the class and whether a line takes clicks only when it creates the line, so
    // they go as props of the component and not in the style it applies afterwards.
    expect(lines.map((line) => line.getAttribute('data-class'))).toEqual([
      'stroke-primary',
      'route-line stroke-primary',
    ]);
    expect(lines.map((line) => line.getAttribute('data-interactive'))).toEqual(['false', 'false']);
    expect(screen.getAllByTestId('bus')).toHaveLength(1);
    expect(screen.getByTestId('bus')).toHaveAttribute('data-points', '41');
  });

  it('marks the origin, the destinations with a route and the other branches apart', () => {
    render(<RoutesMapCanvas branches={branches} selectedBranchId={XELA} routes={routes} />);

    expect(labelsOf()).toEqual([
      'Sucursal de origen: Quetzaltenango',
      'Destino con ruta: Ciudad de Guatemala',
      'Sucursal: Cobán',
    ]);
  });

  it('writes the neighbour countries over the map', () => {
    render(<RoutesMapCanvas branches={branches} selectedBranchId={XELA} routes={routes} />);

    const names = mockMarkers
      .map((marker) => marker.icon.options.html.textContent)
      .filter((text) => ['México', 'Belice', 'Honduras', 'El Salvador'].includes(text ?? ''));
    expect(names).toHaveLength(4);
  });

  it('draws no routes when the branch has none, and no origin when none is chosen', () => {
    render(<RoutesMapCanvas branches={branches} selectedBranchId={null} routes={[]} />);

    expect(screen.queryAllByTestId('line')).toHaveLength(0);
    expect(screen.queryAllByTestId('bus')).toHaveLength(0);
    expect(labelsOf()).toEqual([
      'Sucursal: Quetzaltenango',
      'Sucursal: Ciudad de Guatemala',
      'Sucursal: Cobán',
    ]);
  });

  it('draws no routes from a branch the map does not know', () => {
    render(<RoutesMapCanvas branches={branches} selectedBranchId="desconocida" routes={routes} />);

    expect(screen.queryAllByTestId('line')).toHaveLength(0);
  });
});
