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
// What a visitor may read: where the branches are, for the map of the home page.
const PUBLIC_GET = new Set(['/api/administracion/branches/locations']);
const ROUTE_ROLES: readonly { prefix: string; roles: readonly UserRole[] }[] = [
  { prefix: '/api/system', roles: ['SYSTEM_ADMIN'] },
];

// Encoded or backslash characters could be decoded by a service into a different route.
const AMBIGUOUS_PATH = /%|\\/;

export function isPublicRoute(method: string, url: string): boolean {
  if (method === 'OPTIONS') return true;
  const pathname = canonicalPath(url);
  if (AMBIGUOUS_PATH.test(pathname) || pathname.split('/').includes('..')) return false;
  if (method === 'GET') return PUBLIC_GET.has(pathname);
  return method === 'POST' && PUBLIC_POST.has(pathname);
}

export function requiredRoles(url: string): readonly UserRole[] | null {
  const pathname = canonicalPath(url);
  const rule = ROUTE_ROLES.find(({ prefix }) => isUnderPrefix(pathname, prefix));
  return rule?.roles ?? null;
}
