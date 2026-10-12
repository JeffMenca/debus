import { z } from 'zod';
import { runtimeEnv } from '@/lib/env';
import { getSession, getSessionStatus } from '@/lib/auth/session-store';
import { refreshSession } from '@/lib/auth/session-client';
import { ApiError, FRIENDLY_NETWORK_MESSAGE, apiErrorFrom, messageOf } from './api-error';

export { ApiError, FRIENDLY_NETWORK_MESSAGE, messageOf };

// For answers that carry no body (204): apiRequest hands the schema a null.
export const noContent = z.null();

export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  return parse(await sendWithRenewal(path, init), schema);
}

// An image (or any file) the gateway streams back; errors come out like those of apiRequest.
export async function apiBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const response = await sendWithRenewal(path, init);
  if (!response.ok) throw apiErrorFrom(response.status, await response.json().catch(() => null));
  return response.blob();
}

// An expired token is renewed once and the request repeated with the new one.
async function sendWithRenewal(path: string, init: RequestInit): Promise<Response> {
  const first = await send(path, init, getSession()?.accessToken);
  if (first.status === 401 && getSession()) {
    const renewed = await refreshSession();
    if (renewed) return send(path, init, renewed.accessToken);
    // Not being able to renew is not the same as the session having ended.
    if (getSessionStatus() === 'unavailable') throw new ApiError(0, FRIENDLY_NETWORK_MESSAGE);
  }
  return first;
}

async function send(path: string, init: RequestInit, accessToken?: string): Promise<Response> {
  try {
    return await fetch(`${runtimeEnv().apiUrl}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        // A FormData body carries its own content type, with the multipart boundary.
        ...(!(init.body instanceof FormData) && { 'content-type': 'application/json' }),
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
