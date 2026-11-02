'use client';

import {
  ARCHITECTURE_UNITS,
  type ArchitectureUnit,
  type CircuitState,
  type EventFlow,
  type EventType,
  type SyncCall,
  type UnitHealth,
  syncCallLabel,
  touches,
} from '@debus/contracts';
import { type KeyboardEvent, useId } from 'react';
import { UNIT_LABELS } from '@/lib/system-view';
import { cn } from '@/lib/utils';

const WIDTH = 960;
const HEIGHT = 640;
const HUB = { x: WIDTH / 2, y: HEIGHT / 2 };
const ORBIT = { x: 360, y: 220 };
const NODE = { width: 176, height: 60 };
const HUB_BOX = { width: 200, height: 100 };
// The room left between an arrowhead and the border it points at.
const ARROW_GAP = 4;
const LANE = 5;

// The gateway on top and the services clockwise around Pub/Sub, so the three direct calls
// (ventas, viajes, flota and clientes) join neighbours.
const POSITIONS = Object.fromEntries(
  ARCHITECTURE_UNITS.map((unit, index) => {
    const angle = (index / ARCHITECTURE_UNITS.length) * 2 * Math.PI;
    return [unit, { x: HUB.x + ORBIT.x * Math.sin(angle), y: HUB.y - ORBIT.y * Math.cos(angle) }];
  }),
) as Record<ArchitectureUnit, { x: number; y: number }>;

const CIRCUIT_NOTES: Record<CircuitState, string> = {
  closed: '',
  'half-open': ' · probando de nuevo',
  open: ' · en pausa',
};

type Health = 'up' | 'down' | 'unknown';
const HEALTH_LABELS: Record<Health, string> = {
  up: 'en línea',
  down: 'sin respuesta',
  unknown: 'sin datos',
};
const HEALTH_DOTS: Record<Health, string> = {
  up: 'fill-mint-300',
  down: 'fill-rose-300',
  unknown: 'fill-muted-foreground/50',
};

interface ArchitectureDiagramProps {
  // The events left by the filters; the lines drawn are theirs.
  flows: EventFlow[];
  syncCalls: SyncCall[];
  health: UnitHealth[] | undefined;
  service?: ArchitectureUnit;
  event?: EventType;
  onSelectService: (service: ArchitectureUnit | undefined) => void;
}

type Point = { x: number; y: number };
type Box = { width: number; height: number };

// Where a line that starts at `origin`, inside the box centred at `center`, leaves it along (dx, dy).
function exit(center: Point, box: Box, origin: Point, dx: number, dy: number): Point {
  const along = (d: number, half: number, offset: number) =>
    d === 0 ? Infinity : (Math.sign(d) * half - offset) / d;
  const t = Math.min(
    along(dx, box.width / 2, origin.x - center.x),
    along(dy, box.height / 2, origin.y - center.y),
  );
  return { x: origin.x + dx * t, y: origin.y + dy * t };
}

// The line between Pub/Sub and a unit, shifted sideways by its lane, ending just outside both borders.
export function segment(unit: ArchitectureUnit, lane: number) {
  const node = POSITIONS[unit];
  const length = Math.hypot(node.x - HUB.x, node.y - HUB.y);
  const [ux, uy] = [(node.x - HUB.x) / length, (node.y - HUB.y) / length];
  const [ox, oy] = [-uy * lane, ux * lane];
  const hub = exit(HUB, HUB_BOX, { x: HUB.x + ox, y: HUB.y + oy }, ux, uy);
  const end = exit(node, NODE, { x: node.x + ox, y: node.y + oy }, -ux, -uy);
  return {
    hub: { x: hub.x + ux * ARROW_GAP, y: hub.y + uy * ARROW_GAP },
    node: { x: end.x - ux * ARROW_GAP, y: end.y - uy * ARROW_GAP },
  };
}

// Whether a point lies inside the box of a unit or the hub, to check arrows end outside them.
export function insideBox(point: Point, unit: ArchitectureUnit | 'hub') {
  const center = unit === 'hub' ? HUB : POSITIONS[unit];
  const box = unit === 'hub' ? HUB_BOX : NODE;
  return (
    Math.abs(point.x - center.x) < box.width / 2 && Math.abs(point.y - center.y) < box.height / 2
  );
}

// Where the line from the centre of a box towards a point leaves the box.
function border(unit: ArchitectureUnit, toward: { x: number; y: number }) {
  const { x, y } = POSITIONS[unit];
  const [dx, dy] = [toward.x - x, toward.y - y];
  const t = Math.min(NODE.width / 2 / Math.abs(dx || 1e-9), NODE.height / 2 / Math.abs(dy || 1e-9));
  return { x: x + dx * t, y: y + dy * t };
}

// A curve between two neighbours, bent away from the hub so it never crosses the event lines;
// its label sits just outside the middle of the curve.
function syncPath({ from, to }: SyncCall) {
  const mid = {
    x: (POSITIONS[from].x + POSITIONS[to].x) / 2,
    y: (POSITIONS[from].y + POSITIONS[to].y) / 2,
  };
  const out = { x: mid.x - HUB.x, y: mid.y - HUB.y };
  const length = Math.hypot(out.x, out.y);
  const control = { x: mid.x + (out.x / length) * 110, y: mid.y + (out.y / length) * 110 };
  const a = border(from, control);
  const b = border(to, control);
  const apex = { x: (a.x + 2 * control.x + b.x) / 4, y: (a.y + 2 * control.y + b.y) / 4 };
  const label = { x: apex.x + (out.x / length) * 18, y: apex.y + (out.y / length) * 18 + 4 };
  return { d: `M ${a.x} ${a.y} Q ${control.x} ${control.y} ${b.x} ${b.y}`, label };
}

// The status probe travels like an event but is not a business event, so it is named apart.
function flowCount(flows: EventFlow[]): string {
  const probes = flows.filter((flow) => flow.diagnostic).length;
  const business = `${flows.length - probes} eventos`;
  return probes > 0 ? `${business} + prueba` : business;
}

function healthOf(health: UnitHealth[] | undefined, unit: ArchitectureUnit): Health {
  return health?.find((entry) => entry.unit === unit)?.status ?? 'unknown';
}

function circuitOf(health: UnitHealth[] | undefined, { from, to }: SyncCall): CircuitState {
  const unit = health?.find((entry) => entry.unit === from);
  return unit?.circuits?.find((circuit) => circuit.target === to)?.state ?? 'closed';
}

// The services around Pub/Sub, with a line per direction of the events the filters leave and the
// three direct calls; the live state of each service comes from its health check.
export function ArchitectureDiagram({
  flows,
  syncCalls,
  health,
  service,
  event,
  onSelectService,
}: ArchitectureDiagramProps) {
  const id = useId();
  const narrowed = Boolean(service || event);
  const selected = event ? flows.find((flow) => flow.type === event) : undefined;

  const select = (unit: ArchitectureUnit) => onSelectService(unit === service ? undefined : unit);
  const onKey = (unit: ArchitectureUnit) => (key: KeyboardEvent) => {
    if (key.key !== 'Enter' && key.key !== ' ') return;
    key.preventDefault();
    select(unit);
  };

  return (
    <svg
      role="group"
      aria-label="Arquitectura de debus: el gateway y los siete servicios se comunican por Pub/Sub"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-auto w-full min-w-[680px]"
    >
      <defs>
        <marker
          id={`${id}-publish`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" className="fill-indigo-500" />
        </marker>
        <marker
          id={`${id}-deliver`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" className="fill-mint-500" />
        </marker>
        <marker
          id={`${id}-call`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" className="fill-coral-700" />
        </marker>
      </defs>

      {ARCHITECTURE_UNITS.map((unit) => {
        const publishes = flows.filter((flow) => flow.publisher === unit).length;
        const receives = flows.filter((flow) =>
          flow.consumers.some((consumer) => consumer.service === unit),
        ).length;
        const out = segment(unit, -LANE);
        const back = segment(unit, LANE);
        return (
          <g key={unit}>
            {publishes > 0 && (
              <line
                x1={out.node.x}
                y1={out.node.y}
                x2={out.hub.x}
                y2={out.hub.y}
                markerEnd={`url(#${id}-publish)`}
                className={cn(
                  'stroke-indigo-500 [stroke-width:2.5]',
                  selected && '[stroke-dasharray:8_9] animate-route-sm motion-reduce:animate-none',
                )}
              >
                <title>{`${UNIT_LABELS[unit]} publica ${publishes} eventos`}</title>
              </line>
            )}
            {receives > 0 && (
              <line
                x1={back.hub.x}
                y1={back.hub.y}
                x2={back.node.x}
                y2={back.node.y}
                markerEnd={`url(#${id}-deliver)`}
                className={cn(
                  'stroke-mint-500 [stroke-width:2.5]',
                  selected && '[stroke-dasharray:8_9] animate-route-sm motion-reduce:animate-none',
                )}
              >
                <title>{`${UNIT_LABELS[unit]} recibe ${receives} eventos`}</title>
              </line>
            )}
          </g>
        );
      })}

      <g>
        <rect
          x={HUB.x - HUB_BOX.width / 2}
          y={HUB.y - HUB_BOX.height / 2}
          width={HUB_BOX.width}
          height={HUB_BOX.height}
          rx={24}
          className="fill-mango-100"
        />
        <text
          x={HUB.x}
          y={HUB.y - 16}
          textAnchor="middle"
          className="fill-mango-700 font-display text-[20px] font-bold"
        >
          Pub/Sub
        </text>
        <text
          x={HUB.x}
          y={HUB.y + 8}
          textAnchor="middle"
          className="fill-mango-700 font-mono text-[13px]"
        >
          {selected ? selected.type : flowCount(flows)}
        </text>
        <text x={HUB.x} y={HUB.y + 28} textAnchor="middle" className="fill-mango-700 text-[12px]">
          {selected ? selected.topic : 'un tópico por servicio'}
        </text>
      </g>

      {ARCHITECTURE_UNITS.map((unit) => {
        const { x, y } = POSITIONS[unit];
        const state = healthOf(health, unit);
        const active = unit === service;
        const faded = narrowed && !active && !flows.some((flow) => touches(flow, unit));
        return (
          <g
            key={unit}
            role="button"
            tabIndex={0}
            aria-pressed={active}
            aria-label={`${UNIT_LABELS[unit]}: ${HEALTH_LABELS[state]}`}
            onClick={() => select(unit)}
            onKeyDown={onKey(unit)}
            className={cn(
              'cursor-pointer outline-none transition-opacity motion-reduce:transition-none [&:focus-visible>rect]:stroke-ring [&:focus-visible>rect]:[stroke-width:3]',
              faded && 'opacity-40',
            )}
          >
            <rect
              x={x - NODE.width / 2}
              y={y - NODE.height / 2}
              width={NODE.width}
              height={NODE.height}
              rx={16}
              className={
                active ? 'fill-indigo-100 stroke-indigo-500 [stroke-width:2]' : 'fill-card'
              }
            />
            <circle cx={x - NODE.width / 2 + 20} cy={y - 8} r={6} className={HEALTH_DOTS[state]} />
            <text
              x={x - NODE.width / 2 + 34}
              y={y - 3}
              className="fill-foreground text-[15px] font-semibold"
            >
              {UNIT_LABELS[unit]}
            </text>
            <text
              x={x - NODE.width / 2 + 34}
              y={y + 17}
              className="fill-muted-foreground text-[12px]"
            >
              {HEALTH_LABELS[state]}
            </text>
          </g>
        );
      })}
      {syncCalls.map((call) => {
        const { d, label } = syncPath(call);
        const state = circuitOf(health, call);
        return (
          <g key={`${call.from}>${call.to}`}>
            <path
              d={d}
              fill="none"
              markerEnd={`url(#${id}-call)`}
              className={cn(
                '[stroke-dasharray:4_5] [stroke-width:2]',
                state === 'closed' ? 'stroke-coral-700' : 'stroke-rose-700',
              )}
            />
            <text
              x={label.x}
              y={label.y}
              textAnchor="middle"
              className={cn(
                'stroke-sky-100 text-[13px] font-medium [paint-order:stroke] [stroke-width:6]',
                state === 'closed' ? 'fill-coral-700' : 'fill-rose-700',
              )}
            >
              {`${syncCallLabel(call)}${CIRCUIT_NOTES[state]}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
