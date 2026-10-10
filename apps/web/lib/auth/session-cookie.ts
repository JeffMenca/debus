import type { DebusEnv } from '@debus/contracts';

export const REFRESH_COOKIE = 'debus_refresh';

function baseCookieOptions(appEnv: DebusEnv) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: appEnv !== 'local',
    // The whole site sees it so proxy.ts can spot a session; JavaScript never can (httpOnly).
    path: '/',
  };
}

export function refreshCookieOptions(appEnv: DebusEnv, expires: Date) {
  return { ...baseCookieOptions(appEnv), expires };
}

export function clearedCookieOptions(appEnv: DebusEnv) {
  return { ...baseCookieOptions(appEnv), maxAge: 0 };
}
