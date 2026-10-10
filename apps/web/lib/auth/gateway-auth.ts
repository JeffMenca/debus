import { FRIENDLY_NETWORK_MESSAGE } from '@/lib/api/api-error';
import { readRuntimeEnv } from '@/lib/env';

export async function callGatewayAuth(
  path: 'login' | 'refresh' | 'logout',
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  try {
    const response = await fetch(
      `${readRuntimeEnv(process.env).apiUrl}/api/administracion/auth/${path}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      },
    );
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch {
    return {
      status: 503,
      body: { statusCode: 503, error: 'Service Unavailable', message: FRIENDLY_NETWORK_MESSAGE },
    };
  }
}
