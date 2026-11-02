import {
  ARCHITECTURE_UNIT_LABELS,
  type CircuitState,
  type DeployUnit,
  GUATEMALA_TIME_ZONE,
  type ProbeDeliveryState,
  type ProbeStatus,
} from '@debus/contracts';
import type { StatusTone } from '@/components/brand/status-dot';

export const PROBE_TIMEOUT_MS = 30_000;

export const UNIT_LABELS: Record<DeployUnit, string> = {
  ...ARCHITECTURE_UNIT_LABELS,
  web: 'Sitio web',
};

export interface StatusView {
  label: string;
  tone: StatusTone;
  live: boolean;
}

export function healthView(status: 'up' | 'down'): StatusView {
  return status === 'up'
    ? { label: 'En línea', tone: 'mint', live: false }
    : { label: 'Sin respuesta', tone: 'rose', live: false };
}

const CLOCK = new Intl.DateTimeFormat('es-GT', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZone: GUATEMALA_TIME_ZONE,
});

// A connection between two services: a pause is shown with the time the next try is made.
export function circuitView(state: CircuitState, retryAt: string | null): StatusView {
  if (state === 'closed') return { label: 'Normal', tone: 'mint', live: false };
  if (state === 'half-open') return { label: 'Probando de nuevo', tone: 'mango', live: true };
  const until = retryAt ? ` hasta ${CLOCK.format(new Date(retryAt))}` : '';
  return { label: `En pausa${until}`, tone: 'rose', live: false };
}

// A sleeping service may take a few seconds to wake up, so "unreachable" also waits until the timeout.
export function deliveryView(state: ProbeDeliveryState, elapsedMs: number): StatusView {
  if (state === 'received') return { label: 'Recibido', tone: 'mint', live: false };
  if (elapsedMs < PROBE_TIMEOUT_MS) return { label: 'Esperando', tone: 'mango', live: true };
  return { label: 'No llegó', tone: 'rose', live: false };
}

export function probeFinished(status: ProbeStatus | undefined, elapsedMs: number): boolean {
  if (!status) return false;
  return (
    elapsedMs >= PROBE_TIMEOUT_MS ||
    status.services.every((service) => service.state === 'received')
  );
}
