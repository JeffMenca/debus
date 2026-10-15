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

// Only the message matters to the person; some services answer without the `error` field. It is
// read by hand, not with zod, so the first screen of the site does not carry that library.
function readErrorBody(body: unknown): { message: string; correlationId?: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const { message, correlationId } = body as Record<string, unknown>;
  if (typeof message !== 'string' || message === '') return null;
  if (correlationId === undefined) return { message };
  return typeof correlationId === 'string' ? { message, correlationId } : null;
}

// Keeps the server message whenever the body has one; the connection message is for bodies that
// say nothing readable (an HTML error page, an empty answer).
export function apiErrorFrom(status: number, body: unknown): ApiError {
  const read = readErrorBody(body);
  return read
    ? new ApiError(status, read.message, read.correlationId)
    : new ApiError(status, FRIENDLY_NETWORK_MESSAGE);
}
