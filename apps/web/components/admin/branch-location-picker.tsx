'use client';

import { isInsideGuatemala } from '@debus/contracts';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { roundCoordinate } from '@/lib/geo/coordinates';
import type { MapPoint } from './branch-location-map';

// Leaflet needs the browser, so the map is loaded only there.
const BranchLocationMap = dynamic(() => import('./branch-location-map'), {
  ssr: false,
  loading: () => <Skeleton className="h-80 rounded-2xl" />,
});

interface BranchLocationPickerProps {
  value: MapPoint | null;
  onChange: (value: MapPoint) => void;
  error?: string;
}

export function BranchLocationPicker({ value, onChange, error }: BranchLocationPickerProps) {
  const [outside, setOutside] = useState(false);

  function pick(latitude: number, longitude: number) {
    const inside = isInsideGuatemala(latitude, longitude);
    setOutside(!inside);
    if (inside)
      onChange({ latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) });
  }

  return (
    <div className="flex flex-col gap-2">
      <BranchLocationMap value={value} onPick={pick} />
      {outside && (
        <p role="status" className="text-[13px] text-coral-700">
          Ese punto está fuera de Guatemala.
        </p>
      )}
      {error ? (
        <p role="alert" className="text-[13px] text-rose-700">
          {error}
        </p>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Toca el mapa para marcar dónde está la sucursal.
        </p>
      )}
    </div>
  );
}
