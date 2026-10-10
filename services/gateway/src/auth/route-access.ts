import type { UserRole } from '@debus/contracts';
import { canonicalPath, isUnderPrefix } from '../routing/canonical-path';

const ACCESS_ENDPOINTS = [
  'signup',
  'login',
  'refresh',
  'logout',
  'password',
  'password/forgot',
  'links/status',
  'links/renew',
];
const PUBLIC_POST = new Set(ACCESS_ENDPOINTS.map((path) => `/api/administracion/auth/${path}`));
// Diagnostics stay open until the status page moves behind the admin session (J1-5).
const PUBLIC_PREFIXES = ['/api/system/'];
const ROUTE_ROLES: readonly { prefix: string; roles: readonly UserRole[] }[] = [];

// Encoded or backslash characters could be decoded by a service into a different route.
const AMBIGUOUS_PATH = /%|\\/;

export function isPublicRoute(method: string, url: string): boolean {
  if (method === 'OPTIONS') return true;
  const pathname = canonicalPath(url);
  if (AMBIGUOUS_PATH.test(pathname) || pathname.split('/').includes('..')) return false;
  if (method === 'POST' && PUBLIC_POST.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function requiredRoles(url: string): readonly UserRole[] | null {
  const pathname = canonicalPath(url);
  const rule = ROUTE_ROLES.find(({ prefix }) => isUnderPrefix(pathname, prefix));
  return rule?.roles ?? null;
}
