import type { UnitHealth } from '@debus/contracts';
import { StatusDot } from '@/components/brand/status-dot';
import { UNIT_LABELS, healthView } from '@/lib/system-view';

export function ServiceHealthCard({ units }: { units: UnitHealth[] }) {
  return (
    <section aria-labelledby="services" className="rounded-xl bg-sky-100 p-6">
      <h2 id="services" className="font-display text-xl font-semibold text-sky-700">
        Servicios
      </h2>
      <ul className="mt-4 flex flex-col gap-2">
        {units.map(({ unit, status, latencyMs }) => (
          <li
            key={unit}
            className="flex items-center justify-between gap-3 rounded-lg bg-card px-4 py-3"
          >
            <span className="font-medium text-foreground">{UNIT_LABELS[unit]}</span>
            <span className="flex items-center gap-4">
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {latencyMs} ms
              </span>
              <StatusDot {...healthView(status)} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
