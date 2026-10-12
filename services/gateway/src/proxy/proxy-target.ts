import { type BackendService, isBackendService } from '@debus/contracts';
import { canonicalPath, isInternalPath } from '../routing/canonical-path';

export type ProxyResolution =
  | { kind: 'service'; service: BackendService; target: string; path: string }
  | { kind: 'not-found' };

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
  // Dot segments and `;` parameters are read differently by each hop, so none may pass.
  const segments = decoded.split('/');
  if (segments.includes('..') || segments.includes('.') || decoded.includes(';')) {
    return NOT_FOUND;
  }
  const routed = canonicalPath(decoded);
  if (isInternalPath(routed)) return NOT_FOUND;
  return { kind: 'service', service, target: serviceUrls[service], path: `${path}${search}` };
}
