'use client';

import { Bus } from 'lucide-react';
import { type CSSProperties, type ReactNode, useMemo } from 'react';
import { useBranchLocations } from '@/hooks/use-branch-locations';
import { MAP_BOUNDS, MAP_WIDTH } from '@/lib/geo/guatemala-map';
import { createProjection, curvePath, type Point } from '@/lib/geo/project';

const MAP = createProjection(MAP_BOUNDS, MAP_WIDTH);

interface Label {
  // Where the name sits around the pin, in em so the gap grows with the text.
  dx: number;
  dy: number;
  anchor: 'start' | 'middle' | 'end';
}

// "Antigua Guatemala" is too long for the left of its pin on a phone: the label says "Antigua".
export const labelText = (name: string): string =>
  name.replace(/^(?!Ciudad de )(.+) Guatemala$/, '$1');

// Far enough from the left edge for a long name to fit on its left.
const LEFT_ROOM = 150;

// Beside the pin, on the side that leaves the most map: a branch east of the center has its name on
// its right and one to the west on its left. Past the left edge the name goes above the pin.
export function labelFor([x]: Point, center: number): Label {
  if (x > center) return { dx: 0.9, dy: 0.33, anchor: 'start' };
  if (x < LEFT_ROOM) return { dx: 0, dy: -1.05, anchor: 'middle' };
  return { dx: -0.9, dy: 0.33, anchor: 'end' };
}

// The capital is the hub of the curves, which leave it in every direction: its name sits below and
// to the right, where they are not.
const HUB_LABEL: Label = { dx: 1.05, dy: 1.7, anchor: 'start' };

// The branches of the demo data, placed by hand so no name touches a curve or another name at any
// width of the map. Any other branch gets the generic placement of labelFor and an alternating bend.
const PLACED: Readonly<Record<string, { bend: number; label: Label }>> = {
  'Antigua Guatemala': { bend: -0.3, label: { dx: -0.9, dy: 1.7, anchor: 'end' } },
  Cobán: { bend: -0.3, label: { dx: 0.9, dy: 0.33, anchor: 'start' } },
  Flores: { bend: -0.3, label: { dx: 0.9, dy: 0.33, anchor: 'start' } },
  Huehuetenango: { bend: -0.3, label: { dx: 0, dy: -1.05, anchor: 'middle' } },
  Quetzaltenango: { bend: 0.2, label: { dx: 0, dy: 1.7, anchor: 'middle' } },
};

// Alternating bends keep the curves from running over each other or over a city on the way.
const BENDS = [0.18, -0.2, -0.2, 0.2, 0.2];

const isCapital = (city: { municipality: string; department: string }): boolean =>
  city.department === 'Guatemala' && city.municipality === 'Guatemala';

// The drawing is 600 units wide and shrinks with the screen, so its text would shrink too. Each
// step up below keeps the rendered size at 12px for cities, measured against the width of the map
// (its container), not of the window.
const CITY_SIZE =
  'text-[15px] @max-[500px]:text-[17px] @max-[430px]:text-[20px] @max-[380px]:text-[22px] @max-[340px]:text-[25px] @max-[300px]:text-[27px]';
const LABEL = `fill-foreground font-semibold [paint-order:stroke] stroke-card [stroke-width:0.33em] ${CITY_SIZE}`;

interface Place {
  name: string;
  point: Point;
  label: Label;
}

function placesFrom(
  branches: readonly {
    name: string;
    municipality: string;
    department: string;
    latitude: number;
    longitude: number;
  }[],
): Place[] {
  const capital = branches.find(isCapital) ?? branches[0];
  return [capital, ...branches.filter((branch) => branch !== capital)].flatMap((branch) => {
    if (!branch) return [];
    const point = MAP.project(branch.longitude, branch.latitude);
    const label = PLACED[branch.name]?.label ?? labelFor(point, MAP.width / 2);
    return [{ name: branch.name, point, label: branch === capital ? HUB_LABEL : label }];
  });
}

const distance = ([ax, ay]: Point, [bx, by]: Point): number => Math.hypot(ax - bx, ay - by);

function describe(names: string[]): string {
  if (names.length === 0) return 'Mapa de Guatemala.';
  if (names.length === 1) return `Mapa de Guatemala con la sucursal de ${names[0]}.`;
  return `Mapa de Guatemala con curvas que unen ${names.slice(0, -1).join(', ')} y ${names.at(-1)}.`;
}

// The country and its neighbors come in as children, drawn by the server; the branches are placed
// over them with what the API says. Until it answers (and if it never does) the map shows the
// country alone: a list written in the code could name a city where there is no branch.
export function BranchMap({ children }: { children: ReactNode }) {
  const { data } = useBranchLocations();
  const places = useMemo(() => placesFrom(data ?? []), [data]);
  const [hub, ...others] = places;
  const routes = others.map(({ name, point }, index) => ({
    name,
    length: distance(hub!.point, point),
    d: curvePath(hub!.point, point, PLACED[name]?.bend ?? BENDS[index % BENDS.length]),
  }));
  const busRoute = routes.reduce<(typeof routes)[number] | undefined>(
    (longest, route) => (!longest || route.length > longest.length ? route : longest),
    undefined,
  );

  return (
    <svg
      role="img"
      aria-label={describe(places.map((place) => place.name))}
      viewBox={`0 0 ${MAP.width} ${MAP.height}`}
      className="block h-auto w-full rounded-[32px] bg-sky-100"
    >
      {children}
      {routes.map(({ name, d }) => (
        <g key={name}>
          <path d={d} fill="none" strokeWidth="14" className="stroke-primary/10" />
          <path
            d={d}
            data-route={name}
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
            className="animate-route stroke-primary [stroke-dasharray:8_9] motion-reduce:animate-none"
          />
        </g>
      ))}
      {hub && <circle cx={hub.point[0]} cy={hub.point[1]} r="20" className="fill-primary/15" />}
      {places.map(({ name, point: [x, y], label }) => (
        <g key={name} data-city={name}>
          {name === hub?.name ? (
            <circle cx={x} cy={y} r="9" className="fill-primary" />
          ) : (
            <circle cx={x} cy={y} r="7" strokeWidth="4" className="fill-card stroke-primary" />
          )}
          <text
            x={x}
            y={y}
            dx={`${label.dx}em`}
            dy={`${label.dy}em`}
            textAnchor={label.anchor}
            className={LABEL}
          >
            {labelText(name)}
          </text>
        </g>
      ))}
      {busRoute && (
        <g
          data-testid="map-bus"
          className="animate-drive-along [animation-duration:12s] [offset-distance:50%] [offset-path:var(--route)] [offset-rotate:0deg] motion-reduce:animate-none"
          style={{ '--route': `path('${busRoute.d}')` } as CSSProperties}
        >
          <rect x="-15" y="-15" width="30" height="30" rx="10" className="fill-mango-300" />
          <Bus
            x={-8}
            y={-8}
            width={16}
            height={16}
            strokeWidth={1.75}
            className="stroke-foreground"
          />
        </g>
      )}
    </svg>
  );
}
