import type { SystemMapBranch, SystemMapRoute } from '@debus/contracts';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import RoutesMapCanvas from './routes-map-canvas';

jest.mock('leaflet/dist/leaflet.css', () => ({}));
jest.mock('../maps/department-labels', () => ({
  DepartmentLabels: () => <div data-testid="department-labels" />,
}));
const mockMarkers: { position: [number, number]; icon: { options: { html: HTMLElement } } }[] = [];
// The map as the canvas asks it: where a coordinate falls on the container, and the events it hears.
// `scale` is how many pixels a degree takes, so a bigger one is the map zoomed in.
const mockMap = {
  scale: 100,
  handlers: new Map<string, () => void>(),
  getContainer: () => document.body,
  invalidateSize: jest.fn(),
  latLngToContainerPoint: ([lat, lng]: [number, number]) => ({
    x: lng * mockMap.scale,
    y: -lat * mockMap.scale,
  }),
  on: (names: string, handler: () => void) =>
    names.split(' ').forEach((name) => mockMap.handlers.set(name, handler)),
  off: (names: string) => names.split(' ').forEach((name) => mockMap.handlers.delete(name)),
};
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
  useMap: () => mockMap,
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
  mockMap.scale = 100;
  mockMap.handlers.clear();
});

// A marker is drawn again whenever its side changes: what counts is the last drawing of each.
const lastDrawn = () => {
  const latest = new Map<string, HTMLElement>();
  mockMarkers.forEach((marker) => {
    const html = marker.icon.options.html;
    latest.set(html.getAttribute('aria-label') ?? html.textContent ?? '', html);
  });
  return latest;
};
const labelsOf = () => [...lastDrawn().keys()].filter((label) => label.includes(':'));
const tagOf = (label: string) => lastDrawn().get(label)?.querySelector('[data-part="tag"]');

describe('RoutesMapCanvas', () => {
  it('names the departments on the map', () => {
    render(<RoutesMapCanvas branches={[]} selectedBranchId={null} routes={[]} />);

    expect(screen.getByTestId('department-labels')).toBeInTheDocument();
  });

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

    const names = [...lastDrawn().keys()].filter((text) =>
      ['México', 'Belice', 'Honduras', 'El Salvador'].includes(text),
    );
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

  describe('the tags of the branches', () => {
    const ANTIGUA = 'cd0e6679-7425-40de-944b-e07fc1f90ae7';
    const near: SystemMapBranch[] = [
      { id: GUATE, name: 'Ciudad de Guatemala', latitude: 14.6349, longitude: -90.5069, routes: 1 },
      { id: ANTIGUA, name: 'Antigua Guatemala', latitude: 14.5586, longitude: -90.7295, routes: 0 },
    ];
    const toAntigua: SystemMapRoute[] = [
      {
        routeId: '7c9e6679-7425-40de-944b-e07fc1f90ae2',
        destinationBranchId: ANTIGUA,
        destinationName: 'Antigua Guatemala',
        latitude: 14.5586,
        longitude: -90.7295,
        distanceKm: 45,
        ticketPrice: 25,
        tickets: 4,
      },
    ];
    const ORIGIN = 'Sucursal de origen: Ciudad de Guatemala';
    const DESTINATION = 'Destino con ruta: Antigua Guatemala';

    it('moves a tag out of the way of the one next to it when the map is zoomed out', () => {
      render(<RoutesMapCanvas branches={near} selectedBranchId={GUATE} routes={toAntigua} />);

      // 22 px across and 7 px down: both below their pins would be on top of each other.
      expect(tagOf(ORIGIN)).toHaveClass('bottom-full');
      expect(tagOf(DESTINATION)).toHaveClass('top-full');
    });

    it('counts the pin of a branch without a tag as an obstacle', () => {
      mockMap.scale = 300;
      // Straight under Antigua, where its tag would go.
      const idle: SystemMapBranch = {
        id: COBAN,
        name: 'Cobán',
        latitude: 14.4586,
        longitude: -90.7295,
        routes: 0,
      };

      render(
        <RoutesMapCanvas branches={[...near, idle]} selectedBranchId={GUATE} routes={toAntigua} />,
      );

      expect(tagOf(DESTINATION)).toHaveClass('right-full');
    });

    it('draws them below again when zooming in moves the branches apart', () => {
      render(<RoutesMapCanvas branches={near} selectedBranchId={GUATE} routes={toAntigua} />);

      act(() => {
        mockMap.scale = 2000;
        mockMap.handlers.get('zoomend')?.();
      });

      expect(tagOf(ORIGIN)).toHaveClass('top-full');
      expect(tagOf(DESTINATION)).toHaveClass('top-full');
    });

    it('places them again when the map changes size', () => {
      render(<RoutesMapCanvas branches={near} selectedBranchId={GUATE} routes={toAntigua} />);

      act(() => {
        mockMap.scale = 2000;
        mockMap.handlers.get('resize')?.();
      });

      expect(tagOf(ORIGIN)).toHaveClass('top-full');
    });

    it('places them again when another branch becomes the origin, and stops listening when it goes', () => {
      const { rerender, unmount } = render(
        <RoutesMapCanvas branches={near} selectedBranchId={GUATE} routes={toAntigua} />,
      );

      rerender(<RoutesMapCanvas branches={near} selectedBranchId={ANTIGUA} routes={[]} />);

      expect(tagOf('Sucursal de origen: Antigua Guatemala')).toHaveClass('top-full');
      unmount();
      expect(mockMap.handlers.size).toBe(0);
    });
  });
});
