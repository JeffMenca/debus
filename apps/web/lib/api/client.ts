import type { z } from 'zod';
import { runtimeEnv } from '@/lib/env';
import { getSession, getSessionStatus } from '@/lib/auth/session-store';
import { refreshSession } from '@/lib/auth/session-client';
import { ApiError, FRIENDLY_NETWORK_MESSAGE, apiErrorFrom, messageOf } from './api-error';

export { ApiError, FRIENDLY_NETWORK_MESSAGE, messageOf };

export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const first = await send(path, init, getSession()?.accessToken);
  if (first.status === 401 && getSession()) {
    const renewed = await refreshSession();
    if (renewed) return parse(await send(path, init, renewed.accessToken), schema);
    // Not being able to renew is not the same as the session having ended.
    if (getSessionStatus() === 'unavailable') throw new ApiError(0, FRIENDLY_NETWORK_MESSAGE);
  }
  return parse(first, schema);
}

async function send(path: string, init: RequestInit, accessToken?: string): Promise<Response> {
  try {
    return await fetch(`${runtimeEnv().apiUrl}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(accessToken && { authorization: `Bearer ${accessToken}` }),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, FRIENDLY_NETWORK_MESSAGE);
  }
}

async function parse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw apiErrorFrom(response.status, body);
  return schema.parse(body);
}
