import { readRuntimeEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return new Response(`window.__DEBUS_ENV__=${JSON.stringify(readRuntimeEnv(process.env))};`, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
