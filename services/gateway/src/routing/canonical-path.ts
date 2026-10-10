// Express ignores case, repeated slashes and a trailing slash when routing, so every
// security decision made on a path has to compare it in this form.
export function canonicalPath(urlOrPath: string): string {
  const pathname = (urlOrPath.split('?')[0] ?? '').replace(/\/{2,}/g, '/').toLowerCase();
  return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
}

// True when the path is the prefix itself or one of its sub-paths, never a sibling like /api-x.
export function isUnderPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
