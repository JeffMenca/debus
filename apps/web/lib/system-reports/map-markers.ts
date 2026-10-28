import type { TagSide } from './tag-placement';

export type BranchMarkerKind = 'origin' | 'destination' | 'idle';

// Leaflet writes these into its own layer, outside React, so they are built as DOM nodes (a branch
// name is text typed by a person and never goes through `innerHTML`) and with the classes of the
// design: Tailwind sees these strings because they live in source.
// The marker is a 24 px box (the biggest pin) centered on the coordinate, with the pin centered in
// it: the tag sits against one of its sides, so it moves around the pin without moving the pin.
const MARKER = 'relative size-6 -translate-x-1/2 -translate-y-1/2';
const PIN_BASE = 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';
const PINS: Record<BranchMarkerKind, string> = {
  origin: `${PIN_BASE} size-6 rounded-full bg-primary animate-pulse-live motion-reduce:animate-none`,
  destination: `${PIN_BASE} size-4 rounded-full bg-card ring-4 ring-inset ring-primary`,
  idle: `${PIN_BASE} size-4 rounded-full bg-card ring-4 ring-inset ring-muted-foreground/60`,
};
// 18 px from the coordinate: the radius of the box and a gap, as tag-placement assumes.
const SIDES: Record<TagSide, string> = {
  below: 'top-full left-1/2 mt-1.5 -translate-x-1/2',
  above: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
  right: 'left-full top-1/2 ml-1.5 -translate-y-1/2',
  left: 'right-full top-1/2 mr-1.5 -translate-y-1/2',
};
const TAGS: Record<Exclude<BranchMarkerKind, 'idle'>, string> = {
  origin:
    'absolute w-max rounded-[9px] bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-lift',
  destination:
    'absolute w-max rounded-[9px] bg-card px-2.5 py-1 text-xs font-semibold text-foreground shadow-lift',
};
const LABELS: Record<BranchMarkerKind, string> = {
  origin: 'Sucursal de origen',
  destination: 'Destino con ruta',
  idle: 'Sucursal',
};

function part(tag: 'div' | 'span', name: string, className: string): HTMLElement {
  const element = document.createElement(tag);
  element.dataset.part = name;
  element.className = className;
  return element;
}

export function branchMarkerElement(
  name: string,
  kind: BranchMarkerKind,
  side: TagSide = 'below',
): HTMLElement {
  const marker = part('div', 'city', MARKER);
  marker.setAttribute('role', 'img');
  marker.setAttribute('aria-label', `${LABELS[kind]}: ${name}`);
  marker.append(part('span', 'pin', PINS[kind]));
  if (kind !== 'idle') {
    const tag = part('span', 'tag', `${TAGS[kind]} ${SIDES[side]}`);
    tag.textContent = name;
    marker.append(tag);
  }
  return marker;
}

// The icon of lucide "bus-front", fixed text with nothing from the data in it.
const BUS_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>';

export function busMarkerElement(): HTMLElement {
  const marker = part(
    'div',
    'bus',
    'grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-lg bg-mango-300 text-foreground shadow-lift',
  );
  marker.setAttribute('aria-hidden', 'true');
  marker.innerHTML = BUS_ICON;
  return marker;
}

// The neighbours of Guatemala, written over the country they name so the shape reads as a map.
export const NEIGHBOUR_LABELS: readonly { name: string; position: readonly [number, number] }[] = [
  { name: 'México', position: [17.45, -91.95] },
  { name: 'Belice', position: [17.15, -88.65] },
  { name: 'Honduras', position: [14.95, -88.45] },
  { name: 'El Salvador', position: [13.88, -89.2] },
];

export function neighbourLabelElement(name: string): HTMLElement {
  const label = part(
    'span',
    'neighbour',
    '-translate-x-1/2 -translate-y-1/2 text-xs font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase',
  );
  label.setAttribute('aria-hidden', 'true');
  label.textContent = name;
  return label;
}
