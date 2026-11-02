import { divIcon } from 'leaflet';
import { Marker } from 'react-leaflet';
import { DEPARTMENT_LABELS } from '@/lib/geo/departments';

const LABELS = DEPARTMENT_LABELS.map(({ name, short, latitude, longitude }) => ({
  name,
  position: [latitude, longitude] as [number, number],
  icon: divIcon({
    className: 'bg-transparent',
    iconSize: [0, 0],
    html: `<span aria-hidden="true" class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[10px] font-semibold whitespace-nowrap text-muted-foreground">${short}</span>`,
  }),
}));

// Below the pins and the names of the branches, which are the point of the map.
export function DepartmentLabels() {
  return LABELS.map(({ name, position, icon }) => (
    <Marker
      key={name}
      position={position}
      icon={icon}
      interactive={false}
      keyboard={false}
      zIndexOffset={-1000}
    />
  ));
}
