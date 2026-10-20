import type { UserRole } from '@debus/contracts';

const HOME: Record<UserRole, string> = {
  SYSTEM_ADMIN: '/admin',
  BRANCH_ADMIN: '/sucursal',
  CASHIER: '/sucursal',
  DRIVER: '/chofer',
  CLIENT: '/',
};

export const homePathFor = (role: UserRole): string => HOME[role];

// Where "go to the start" leads from a page that failed: the area of the person, a client's own
// account, or the public home page when nobody is signed in.
export const startPathFor = (role: UserRole | undefined): string => {
  if (!role) return '/';
  return role === 'CLIENT' ? '/cuenta' : homePathFor(role);
};

const SITE = 'http://debus.invalid';
const CONTROL_OR_SPACE = /[\u0000-\u001F\u007F\s]/;

// Browsers drop tabs and line breaks inside URLs and read "\\" as "/", so a prefix check is not
// enough ("/<tab>/host" becomes "//host"). The address is resolved the way a browser would and
// only accepted when it stays on this site.
export function safeNext(value: string | null): string | null {
  if (!value?.startsWith('/') || CONTROL_OR_SPACE.test(value)) return null;
  try {
    const url = new URL(value, SITE);
    // Dot segments can leave "//host" behind ("/.//host"), which a browser reads as another site.
    const sameSite = url.origin === SITE && !/^\/[/\\]/.test(url.pathname);
    return sameSite ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}
