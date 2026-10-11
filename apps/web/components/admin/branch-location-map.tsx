'use client';

import 'leaflet/dist/leaflet.css';
import { GUATEMALA_BOUNDS } from '@debus/contracts';
import { divIcon } from 'leaflet';
import type { ComponentProps } from 'react';
import { GeoJSON, MapContainer, Marker, useMapEvents } from 'react-leaflet';
import guatemala from '@/lib/geo/guatemala.json';

type GeoData = ComponentProps<typeof GeoJSON>['data'];

export interface MapPoint {
  latitude: number;
  longitude: number;
}

interface BranchLocationMapProps {
  value: MapPoint | null;
  onPick: (latitude: number, longitude: number) => void;
}

// Leaflet writes SVG attributes, which cannot read CSS variables, so the colors come from
// classes. Tailwind sees these strings because they live in source.
const OUTLINE_CLASSES = {
  home: 'fill-card stroke-lilac-300',
  neighbour: 'fill-muted stroke-transparent',
};

const VIEW: [[number, number], [number, number]] = [
  [GUATEMALA_BOUNDS.minLatitude, GUATEMALA_BOUNDS.minLongitude],
  [GUATEMALA_BOUNDS.maxLatitude, GUATEMALA_BOUNDS.maxLongitude],
];
const MARGIN = 0.6;
const MAX_BOUNDS: [[number, number], [number, number]] = [
  [GUATEMALA_BOUNDS.minLatitude - MARGIN, GUATEMALA_BOUNDS.minLongitude - MARGIN],
  [GUATEMALA_BOUNDS.maxLatitude + MARGIN, GUATEMALA_BOUNDS.maxLongitude + MARGIN],
];

const PIN = divIcon({
  className: 'bg-transparent',
  html: '<span class="block size-4 rounded-full bg-primary ring-4 ring-indigo-100 animate-pulse-live motion-reduce:animate-none"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function ClickToPick({ onPick }: Pick<BranchLocationMapProps, 'onPick'>) {
  useMapEvents({ click: (event) => onPick(event.latlng.lat, event.latlng.lng) });
  return null;
}

// Leaflet's own stylesheet paints the container gray without a layer, so the sky token needs `!`.
// No tiles: the country outline is the whole map, so nothing is requested from other servers.
export default function BranchLocationMap({ value, onPick }: BranchLocationMapProps) {
  return (
    <div role="group" aria-label="Mapa para ubicar la sucursal">
      <MapContainer
        bounds={VIEW}
        maxBounds={MAX_BOUNDS}
        zoomControl={false}
        attributionControl={false}
        className="h-80 rounded-2xl bg-sky-100!"
      >
        <GeoJSON
          data={guatemala as GeoData}
          style={(feature) => ({
            className: feature?.properties?.gt ? OUTLINE_CLASSES.home : OUTLINE_CLASSES.neighbour,
            weight: 1.5,
            fillOpacity: 1,
          })}
        />
        <ClickToPick onPick={onPick} />
        {value && <Marker position={[value.latitude, value.longitude]} icon={PIN} />}
      </MapContainer>
    </div>
  );
}
