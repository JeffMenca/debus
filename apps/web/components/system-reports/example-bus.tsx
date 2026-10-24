'use client';

import type { Marker as LeafletMarker } from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { Marker } from 'react-leaflet';
import { useMediaQuery } from '@/hooks/use-media-query';
import { type LatLng, pointAlong } from '@/lib/system-reports/route-curve';
import { busIcon } from './map-icons';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const MIDDLE = 0.5;

interface ExampleBusProps {
  points: readonly LatLng[];
  // Where on the route it starts (0 to 1) and how much of it it covers each second.
  offset: number;
  speed: number;
}

// A decoration: it shows the direction of the route, and does not stand for a real bus. For who
// asked for less motion it waits at the middle of the route.
export function ExampleBus({ points, offset, speed }: ExampleBusProps) {
  const reduced = useMediaQuery(REDUCED_MOTION);
  const marker = useRef<LeafletMarker>(null);
  const icon = useMemo(() => busIcon(), []);

  useEffect(() => {
    const place = (progress: number) => marker.current?.setLatLng(pointAlong(points, progress));
    if (reduced) {
      place(MIDDLE);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      place(offset + ((now - start) / 1000) * speed);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [points, offset, speed, reduced]);

  return (
    <Marker ref={marker} position={points[0]!} icon={icon} interactive={false} zIndexOffset={800} />
  );
}
