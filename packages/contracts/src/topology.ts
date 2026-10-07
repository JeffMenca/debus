export const BACKEND_SERVICES = [
  'administracion',
  'flota',
  'viajes',
  'ventas',
  'clientes',
  'reportes',
  'notificaciones',
] as const;
export type BackendService = (typeof BACKEND_SERVICES)[number];

export const DEPLOY_UNITS = ['gateway', ...BACKEND_SERVICES, 'web'] as const;
export type DeployUnit = (typeof DEPLOY_UNITS)[number];

export const LOCAL_PORTS: Readonly<Record<DeployUnit, number>> = {
  web: 3000,
  gateway: 4000,
  administracion: 4001,
  flota: 4002,
  viajes: 4003,
  ventas: 4004,
  clientes: 4005,
  reportes: 4006,
  notificaciones: 4007,
};

export const DEBUS_ENVIRONMENTS = ['local', 'production'] as const;
export type DebusEnv = (typeof DEBUS_ENVIRONMENTS)[number];
export type CloudEnv = Exclude<DebusEnv, 'local'>;

export interface CloudRunLocation {
  projectNumber: string;
  region: string;
}

export function serviceUrl(unit: DeployUnit, env: DebusEnv, location?: CloudRunLocation): string {
  if (env === 'local') return `http://localhost:${LOCAL_PORTS[unit]}`;
  if (!location) throw new Error('Cloud Run location is required outside local');
  return `https://${unit}-${location.projectNumber}.${location.region}.run.app`;
}

export function isBackendService(value: string): value is BackendService {
  return (BACKEND_SERVICES as readonly string[]).includes(value);
}
