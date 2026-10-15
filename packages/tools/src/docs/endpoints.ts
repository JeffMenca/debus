import { BACKEND_SERVICES, type BackendService } from '@debus/contracts';
import { actionFor } from './actions-es';
import { HTTP_METHODS, type OpenApiDocument, type OperationObject } from '../postman/openapi-types';

const NONE = 'Este servicio no publica endpoints en el Swagger.';

// A service documents its `/health` as open, but the gateway asks for a session on everything under
// `/api` except the account routes, so by the public address it needs one.
function rolesOf(operation: OperationObject, route: string, service: string): string {
  const roles = /Allowed roles: ([A-Z_, ]+)\./.exec(operation.description ?? '')?.[1];
  if (roles) return roles.trim();
  const needsSession =
    Boolean(operation.security?.length) || (route === '/health' && service !== 'gateway');
  return needsSession ? 'Cualquier sesión' : 'Público';
}

// The Swagger has no summary on most routes: the text written for the handler says what it does,
// and the name of the handler stands in until it is written.
const actionOf = (operation: OperationObject): string =>
  operation.summary?.trim() ||
  actionFor(operation.operationId) ||
  operation.operationId?.split('_').at(-1) ||
  '';

// Code-unit order, not locale order, so the table reads the same on every machine.
function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function routeOf(path: string, service: BackendService | 'gateway'): string | null {
  if (path.includes('/internal/')) return null;
  if (service === 'gateway') {
    return BACKEND_SERVICES.some((backend) => path.startsWith(`/api/${backend}/`)) ? null : path;
  }
  const prefix = `/api/${service}`;
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : null;
}

// One row per public route of a service, with the roles that may call it.
export function endpointsTable(openapi: OpenApiDocument, service: string): string {
  const owner = service as BackendService | 'gateway';
  const rows = Object.entries(openapi.paths).flatMap(([path, operations]) => {
    const route = routeOf(path, owner);
    if (!route) return [];
    return HTTP_METHODS.flatMap((method) => {
      const operation = operations[method];
      return operation ? [{ route, method, operation }] : [];
    });
  });
  if (rows.length === 0) return NONE;
  rows.sort(
    (a, b) =>
      compareText(a.route, b.route) ||
      HTTP_METHODS.indexOf(a.method) - HTTP_METHODS.indexOf(b.method),
  );
  return [
    '| Método | Ruta | Qué hace | Roles |',
    '| --- | --- | --- | --- |',
    ...rows.map(
      ({ route, method, operation }) =>
        `| \`${method.toUpperCase()}\` | \`${route}\` | ${actionOf(operation)} | ${rolesOf(operation, route, service)} |`,
    ),
  ].join('\n');
}
