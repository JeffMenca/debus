import { Mail, MapPinned, Smartphone, type LucideIcon } from 'lucide-react';
import guatemala from '@/lib/geo/guatemala.json';
import { MAP_BOUNDS, MAP_WIDTH } from '@/lib/geo/guatemala-map';
import { projectGeoJson } from '@/lib/geo/project';
import { BranchMap } from './branch-map';

// The outline comes from Natural Earth (public domain). It is projected while the page is built,
// so the shapes travel as markup and the GeoJSON never reaches the browser bundle.
const MAP = projectGeoJson(guatemala, MAP_BOUNDS, MAP_WIDTH);

const NEIGHBORS = [
  { name: 'MÉXICO', lon: -91.6, lat: 17.45 },
  { name: 'BELICE', lon: -88.65, lat: 17.15 },
  { name: 'HONDURAS', lon: -88.75, lat: 14.95 },
  { name: 'EL SALVADOR', lon: -89.2, lat: 13.88 },
];

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
// step up keeps the rendered size at 11px for the neighbors, measured against the width of the
// map (its container), not of the window.
const NEIGHBOR_SIZE =
  'text-[14px] @max-[500px]:text-[16px] @max-[430px]:text-[18px] @max-[380px]:text-[20px] @max-[340px]:text-[23px] @max-[300px]:text-[25px]';

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
        <BranchMap>
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
        </BranchMap>
      </div>
    </section>
  );
}
