import { divIcon } from 'leaflet';
import {
  type BranchMarkerKind,
  branchMarkerElement,
  busMarkerElement,
  neighbourLabelElement,
} from '@/lib/system-reports/map-markers';
import type { TagSide } from '@/lib/system-reports/tag-placement';

// Each marker gets its own element: a DOM node can live in one place only.
const around = (html: HTMLElement) =>
  divIcon({ className: 'bg-transparent', iconSize: [0, 0], html });

export const branchIcon = (name: string, kind: BranchMarkerKind, side?: TagSide) =>
  around(branchMarkerElement(name, kind, side));

export const busIcon = () => around(busMarkerElement());

export const neighbourIcon = (name: string) => around(neighbourLabelElement(name));
