import { errorResponseSchema } from '@debus/contracts';
import type { z } from 'zod';
import { runtimeEnv } from '@/lib/env';

export const FRIENDLY_NETWORK_MESSAGE =
  'No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${runtimeEnv().apiUrl}${path}`, {
      ...init,
      headers: { accept: 'application/json', 'content-type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(0, FRIENDLY_NETWORK_MESSAGE);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = errorResponseSchema.safeParse(body);
    throw error.success
      ? new ApiError(response.status, error.data.message, error.data.correlationId)
      : new ApiError(response.status, FRIENDLY_NETWORK_MESSAGE);
  }
  return schema.parse(body);
}
