import type { DeployUnit, ProbeDeliveryState, ProbeStatus } from '@debus/contracts';
import type { StatusTone } from '@/components/brand/status-dot';

export const PROBE_TIMEOUT_MS = 30_000;

export const UNIT_LABELS: Record<DeployUnit, string> = {
  gateway: 'Entrada principal',
  administracion: 'Administración',
  flota: 'Flota',
  viajes: 'Viajes',
  ventas: 'Ventas',
  clientes: 'Clientes',
  reportes: 'Reportes',
  notificaciones: 'Notificaciones',
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
