'use client';

import 'leaflet/dist/leaflet.css';
import type { SystemMapBranch, SystemMapRoute } from '@debus/contracts';
import type { ComponentProps } from 'react';
import { Fragment, useEffect, useMemo } from 'react';
import {
  AttributionControl,
  GeoJSON,
  MapContainer,
  Marker,
  Polyline,
  ZoomControl,
  useMap,
} from 'react-leaflet';
import { MAP_BOUNDS } from '@/lib/geo/guatemala-map';
import guatemala from '@/lib/geo/guatemala.json';
import { type BranchMarkerKind, NEIGHBOUR_LABELS } from '@/lib/system-reports/map-markers';
import { curvePoints } from '@/lib/system-reports/route-curve';
import { ExampleBus } from './example-bus';
import { branchIcon, neighbourIcon } from './map-icons';

type GeoData = ComponentProps<typeof GeoJSON>['data'];

// Leaflet writes SVG attributes, which cannot read CSS variables, so the colors come from
// classes. Tailwind sees these strings because they live in source.
const OUTLINE_CLASSES = {
  home: 'fill-card stroke-lilac-500',
  neighbour: 'fill-muted stroke-transparent',
};
// The class and `interactive` are read when Leaflet creates a line and never again, so they go as
// props of the Polyline; the rest of the style may be applied afterwards, through pathOptions.
const HALO = {
  line: { className: 'stroke-primary', interactive: false },
  style: { weight: 12, opacity: 0.1 },
};
const LINE = {
  line: { className: 'route-line stroke-primary', interactive: false },
  style: { weight: 4, opacity: 0.95, dashArray: '8 9' },
};
const VIEW: [[number, number], [number, number]] = [
  [MAP_BOUNDS.south, MAP_BOUNDS.west],
  [MAP_BOUNDS.north, MAP_BOUNDS.east],
];

// The sidebar folding changes the width of the map without resizing the window, which Leaflet
// would not notice on its own.
function KeepSize() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function BranchMarker({ branch, kind }: { branch: SystemMapBranch; kind: BranchMarkerKind }) {
  const icon = useMemo(() => branchIcon(branch.name, kind), [branch.name, kind]);
  return (
    <Marker
      position={[branch.latitude, branch.longitude]}
      icon={icon}
      interactive={false}
      zIndexOffset={kind === 'origin' ? 1000 : 500}
    />
  );
}

function NeighbourLabel({ name, position }: { name: string; position: readonly [number, number] }) {
  const icon = useMemo(() => neighbourIcon(name), [name]);
  return <Marker position={[position[0], position[1]]} icon={icon} interactive={false} />;
}

interface RoutesMapCanvasProps {
  branches: SystemMapBranch[];
  selectedBranchId: string | null;
  routes: SystemMapRoute[];
}

// The country as an outline (no tiles: nothing is asked of other servers), the routes of the chosen
// branch as curves with an example bus on each, and every branch where it is.
export default function RoutesMapCanvas({
  branches,
  selectedBranchId,
  routes,
}: RoutesMapCanvasProps) {
  const origin = branches.find((branch) => branch.id === selectedBranchId);
  const curves = useMemo(
    () =>
      origin
        ? routes.map((route) => ({
            route,
            points: curvePoints(
              [origin.latitude, origin.longitude],
              [route.latitude, route.longitude],
            ),
          }))
        : [],
    [origin, routes],
  );
  const destinations = useMemo(
    () => new Set(curves.map(({ route }) => route.destinationBranchId)),
    [curves],
  );
  const kindOf = (branch: SystemMapBranch): BranchMarkerKind => {
    if (branch.id === origin?.id) return 'origin';
    return destinations.has(branch.id) ? 'destination' : 'idle';
  };

  return (
    <MapContainer
      bounds={VIEW}
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom={false}
      zoomSnap={0.25}
      className="size-full bg-sky-100!"
    >
      <GeoJSON
        data={guatemala as GeoData}
        interactive={false}
        attribution="Natural Earth"
        style={(feature) => ({
          className: feature?.properties?.gt ? OUTLINE_CLASSES.home : OUTLINE_CLASSES.neighbour,
          weight: feature?.properties?.gt ? 2.5 : 1,
          fillOpacity: 1,
        })}
      />
      <ZoomControl position="topright" />
      <AttributionControl position="bottomright" prefix="Leaflet" />
      <KeepSize />
      {NEIGHBOUR_LABELS.map(({ name, position }) => (
        <NeighbourLabel key={name} name={name} position={position} />
      ))}
      {curves.map(({ route, points }, index) => (
        <Fragment key={route.routeId}>
          <Polyline positions={points} {...HALO.line} pathOptions={HALO.style} />
          <Polyline positions={points} {...LINE.line} pathOptions={LINE.style} />
          <ExampleBus points={points} offset={index * 0.23} speed={0.06 + 0.02 * (index % 2)} />
        </Fragment>
      ))}
      {branches.map((branch) => (
        <BranchMarker key={branch.id} branch={branch} kind={kindOf(branch)} />
      ))}
    </MapContainer>
  );
}
