import { type AuthTokens, authTokensSchema } from '@debus/contracts';
import { NextRequest, NextResponse } from 'next/server';
import { readRuntimeEnv } from '@/lib/env';
import { REFRESH_COOKIE, clearedCookieOptions, refreshCookieOptions } from './session-cookie';

export const parseTokens = (body: unknown): AuthTokens | null => {
  const parsed = authTokensSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
};

const appEnv = () => readRuntimeEnv(process.env).appEnv;

// The browser gets the access token; the refresh token only travels in the http only cookie.
export function sessionResponse(tokens: AuthTokens): NextResponse {
  const { refreshToken, refreshExpiresAt, ...session } = tokens;
  const response = NextResponse.json(session);
  response.cookies.set(
    REFRESH_COOKIE,
    refreshToken,
    refreshCookieOptions(appEnv(), new Date(refreshExpiresAt)),
  );
  return response;
}

export const readRefreshCookie = (request: Request): string | undefined =>
  new NextRequest(request).cookies.get(REFRESH_COOKIE)?.value;

export function clearRefreshCookie(response: NextResponse): NextResponse {
  response.cookies.set(REFRESH_COOKIE, '', clearedCookieOptions(appEnv()));
  return response;
}
