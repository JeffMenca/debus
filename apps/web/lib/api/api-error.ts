import { z } from 'zod';

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

export const messageOf = (error: unknown): string =>
  error instanceof ApiError ? error.message : FRIENDLY_NETWORK_MESSAGE;

// Only the message matters to the person; some services answer without the `error` field.
const errorBodySchema = z.object({
  message: z.string().min(1),
  correlationId: z.string().optional(),
});

// Keeps the server message whenever the body has one; the connection message is for bodies that
// say nothing readable (an HTML error page, an empty answer).
export function apiErrorFrom(status: number, body: unknown): ApiError {
  const parsed = errorBodySchema.safeParse(body);
  return parsed.success
    ? new ApiError(status, parsed.data.message, parsed.data.correlationId)
    : new ApiError(status, FRIENDLY_NETWORK_MESSAGE);
}
