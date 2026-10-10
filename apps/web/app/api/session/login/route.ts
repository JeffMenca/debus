import { NextResponse } from 'next/server';
import { callGatewayAuth } from '@/lib/auth/gateway-auth';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { parseTokens, sessionResponse } from '@/lib/auth/session-response';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const result = await callGatewayAuth('login', await request.json().catch(() => ({})));
  const tokens = result.status === 200 ? parseTokens(result.body) : null;
  if (!tokens) {
    return NextResponse.json(result.body, { status: result.status === 200 ? 502 : result.status });
  }
  return sessionResponse(tokens);
}
