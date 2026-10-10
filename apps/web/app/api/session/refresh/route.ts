import { NextResponse } from 'next/server';
import { callGatewayAuth } from '@/lib/auth/gateway-auth';
import { isSameOrigin } from '@/lib/auth/same-origin';
import {
  clearRefreshCookie,
  parseTokens,
  readRefreshCookie,
  sessionResponse,
} from '@/lib/auth/session-response';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const current = readRefreshCookie(request);
  // No cookie is not an error: it is just a visitor, and there is nothing to refresh.
  if (!current) return new Response(null, { status: 204 });

  const result = await callGatewayAuth('refresh', { refreshToken: current });
  const tokens = result.status === 200 ? parseTokens(result.body) : null;
  if (tokens) return sessionResponse(tokens);

  // A gateway outage must not sign people out; only a refusal ends the session.
  const status = result.status >= 500 ? result.status : 401;
  const response = NextResponse.json(result.body, { status });
  return status === 401 ? clearRefreshCookie(response) : response;
}
