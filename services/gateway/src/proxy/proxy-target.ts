import { type BackendService, isBackendService } from '@debus/contracts';

export type ProxyResolution =
  | { kind: 'service'; service: BackendService; target: string; path: string }
  | { kind: 'not-found' };

// Pub/Sub push and scheduler endpoints are reachable only inside GCP, never through the gateway.
const INTERNAL_PREFIXES = ['/events', '/outbox'];
const NOT_FOUND: ProxyResolution = { kind: 'not-found' };

export function resolveProxyTarget(
  originalUrl: string,
  serviceUrls: Readonly<Record<BackendService, string>>,
): ProxyResolution {
  const queryStart = originalUrl.indexOf('?');
  const pathname = queryStart === -1 ? originalUrl : originalUrl.slice(0, queryStart);
  const search = queryStart === -1 ? '' : originalUrl.slice(queryStart);
  const match = /^\/api\/([^/]+)(\/.*)?$/.exec(pathname);
  const service = match?.[1] ?? '';
  if (!isBackendService(service)) return NOT_FOUND;

  const path = match?.[2] ?? '/';
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return NOT_FOUND;
  }
  if (decoded.split('/').includes('..')) return NOT_FOUND;
  if (INTERNAL_PREFIXES.some((prefix) => decoded === prefix || decoded.startsWith(`${prefix}/`))) {
    return NOT_FOUND;
  }
  return { kind: 'service', service, target: serviceUrls[service], path: `${path}${search}` };
}
