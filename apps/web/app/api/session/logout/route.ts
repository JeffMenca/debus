import { NextResponse } from 'next/server';
import { callGatewayAuth } from '@/lib/auth/gateway-auth';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { clearRefreshCookie, readRefreshCookie } from '@/lib/auth/session-response';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const current = readRefreshCookie(request);
  if (current) await callGatewayAuth('logout', { refreshToken: current });
  return clearRefreshCookie(new NextResponse(null, { status: 204 }));
}
