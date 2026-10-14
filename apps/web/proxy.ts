import { type NextRequest, NextResponse } from 'next/server';
import { REFRESH_COOKIE } from '@/lib/auth/session-cookie';

// Optimistic check: the real authorization happens in the gateway and the services.
export function proxy(request: NextRequest): NextResponse {
  if (request.cookies.has(REFRESH_COOKIE)) return NextResponse.next();
  const login = new URL('/login', request.url);
  login.searchParams.set('siguiente', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/admin/:path*', '/sucursal/:path*', '/chofer/:path*', '/cuenta/:path*'],
};
