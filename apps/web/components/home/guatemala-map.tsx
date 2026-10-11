import { Bus, Mail, MapPinned, Smartphone, type LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import guatemala from '@/lib/geo/guatemala.json';
import { curvePath, projectGeoJson } from '@/lib/geo/project';

// The outline comes from Natural Earth (public domain). It is projected while the page is built,
// so the shapes travel as markup and the GeoJSON never reaches the browser bundle.
const BOUNDS = { west: -92.25, east: -88.2, south: 13.7, north: 17.85 };
const MAP = projectGeoJson(guatemala, BOUNDS, 600);

interface City {
  name: string;
  lon: number;
  lat: number;
  // Where the name sits around the pin, in em so the gap grows with the text.
  label: { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' };
}

// The first city is the hub every curve starts from.
const CITIES: readonly City[] = [
  {
    name: 'Ciudad de Guatemala',
    lon: -90.5069,
    lat: 14.6349,
    label: { dx: 1.05, dy: 1.7, anchor: 'start' },
  },
  {
    name: 'Quetzaltenango',
    lon: -91.518,
    lat: 14.8347,
    label: { dx: 0, dy: -1.05, anchor: 'middle' },
  },
  { name: 'Cobán', lon: -90.37, lat: 15.47, label: { dx: -0.9, dy: 0.33, anchor: 'end' } },
  {
    name: 'Puerto Barrios',
    lon: -88.5944,
    lat: 15.7278,
    label: { dx: 0, dy: -1.05, anchor: 'end' },
  },
  { name: 'Flores', lon: -89.892, lat: 16.93, label: { dx: 0.9, dy: 0.33, anchor: 'start' } },
  { name: 'Antigua', lon: -90.7295, lat: 14.5586, label: { dx: -0.9, dy: 1.7, anchor: 'end' } },
];

const NEIGHBORS = [
  { name: 'MÉXICO', lon: -91.6, lat: 17.45 },
  { name: 'BELICE', lon: -88.65, lat: 17.15 },
  { name: 'HONDURAS', lon: -88.75, lat: 14.95 },
  { name: 'EL SALVADOR', lon: -89.2, lat: 13.88 },
];

const PLACES = CITIES.map((city) => ({ ...city, point: MAP.project(city.lon, city.lat) }));
const [HUB, ...OTHERS] = PLACES;
// Alternating bends keep the curves from running over each other or over a city on the way.
const BENDS = [0.18, -0.2, -0.2, 0.2, 0.2];
const ROUTES = OTHERS.map(({ name, point }, index) => ({
  name,
  d: curvePath(HUB.point, point, BENDS[index]),
}));
const BUS_ROUTE = ROUTES.find((route) => route.name === 'Flores')!;

const NAMES = CITIES.map((city) => city.name);
const DESCRIPTION = `Mapa de Guatemala con curvas que unen ${NAMES.slice(0, -1).join(', ')} y ${NAMES.at(-1)}.`;

interface Highlight {
  title: string;
  text: string;
  icon: LucideIcon;
  // Surface (100) and text (700) of the same family.
  tone: string;
}

const HIGHLIGHTS: readonly Highlight[] = [
  {
    title: 'Sucursales en todo el país',
    text: 'Elige desde dónde sales y adónde llegas.',
    icon: MapPinned,
    tone: 'bg-indigo-100 text-indigo-700',
  },
  {
    title: 'Compra sin filas',
    text: 'Reserva desde tu celular y sube al bus con tu boleto.',
    icon: Smartphone,
    tone: 'bg-mint-100 text-mint-700',
  },
  {
    title: 'Tu boleto en tu correo',
    text: 'Recibes la confirmación apenas pagas.',
    icon: Mail,
    tone: 'bg-mango-100 text-mango-700',
  },
];

// The drawing is 600 units wide and shrinks with the screen, so its text would shrink too. Each
// step up below keeps the rendered size at 12px for cities and 11px for the neighbors, measured
// against the width of the map (its container), not of the window.
const CITY_SIZE =
  'text-[15px] @max-[500px]:text-[17px] @max-[430px]:text-[20px] @max-[380px]:text-[22px] @max-[340px]:text-[25px] @max-[300px]:text-[27px]';
const NEIGHBOR_SIZE =
  'text-[14px] @max-[500px]:text-[16px] @max-[430px]:text-[18px] @max-[380px]:text-[20px] @max-[340px]:text-[23px] @max-[300px]:text-[25px]';
const LABEL = `fill-foreground font-semibold [paint-order:stroke] stroke-card [stroke-width:0.33em] ${CITY_SIZE}`;

export function GuatemalaMap() {
  return (
    <section
      aria-labelledby="map-title"
      className="grid animate-arrive items-center gap-8 px-4.5 [animation-delay:120ms] sm:px-11 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 motion-reduce:animate-none"
    >
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-3">
          <h2
            id="map-title"
            className="font-display text-[clamp(32px,4vw,48px)] leading-none font-bold text-balance text-foreground"
          >
            Conectamos todo el país
          </h2>
          <p className="max-w-[440px] text-lg leading-[1.6] text-muted-foreground">
            Los buses de debus unen las sucursales de Guatemala para que viajes cómodo y sin filas.
          </p>
        </div>
        <ul className="flex flex-col gap-5">
          {HIGHLIGHTS.map(({ title, text, icon: Icon, tone }) => (
            <li key={title} className="flex items-center gap-4">
              <span
                className={`flex size-14 shrink-0 items-center justify-center rounded-[18px] ${tone}`}
              >
                <Icon aria-hidden="true" strokeWidth={1.75} className="size-6" />
              </span>
              <div className="flex flex-col gap-0.5">
                <h3 className="font-display text-[22px] leading-[1.2] font-bold text-foreground">
                  {title}
                </h3>
                <p className="text-base leading-[1.5] text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="@container w-full max-w-[680px] justify-self-end">
        <svg
          role="img"
          aria-label={DESCRIPTION}
          viewBox={`0 0 ${MAP.width} ${MAP.height}`}
          className="block h-auto w-full rounded-[32px] bg-sky-100"
        >
          {MAP.features.map(({ name, isHome, path }) => (
            <path
              key={name}
              d={path}
              fillRule="evenodd"
              className={
                isHome
                  ? 'fill-card stroke-lilac-300 stroke-[3px] [stroke-linejoin:round]'
                  : 'fill-muted-2 stroke-muted-foreground/25 stroke-1'
              }
            />
          ))}
          {NEIGHBORS.map(({ name, lon, lat }) => {
            const [x, y] = MAP.project(lon, lat);
            return (
              <text
                key={name}
                x={x}
                y={y}
                textAnchor="middle"
                className={`fill-muted-foreground font-semibold tracking-[0.08em] ${NEIGHBOR_SIZE}`}
              >
                {name}
              </text>
            );
          })}
          {ROUTES.map(({ name, d }) => (
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
          <circle cx={HUB.point[0]} cy={HUB.point[1]} r="20" className="fill-primary/15" />
          {PLACES.map(({ name, point: [x, y], label }) => (
            <g key={name} data-city={name}>
              {name === HUB.name ? (
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
                {name}
              </text>
            </g>
          ))}
          <g
            data-testid="map-bus"
            className="animate-drive-along [animation-duration:12s] [offset-distance:50%] [offset-path:var(--route)] [offset-rotate:0deg] motion-reduce:animate-none"
            style={{ '--route': `path('${BUS_ROUTE.d}')` } as CSSProperties}
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
        </svg>
      </div>
    </section>
  );
}
