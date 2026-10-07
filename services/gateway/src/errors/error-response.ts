import { STATUS_CODES } from 'node:http';
import { CORRELATION_HEADER, type ErrorResponse } from '@debus/contracts';

export const MESSAGES = {
  notFound: 'No encontramos lo que buscas.',
  upstream: 'El servicio no respondió. Intenta de nuevo en unos segundos.',
  generic: 'Algo salió mal. Intenta de nuevo en unos segundos.',
} as const;

export function errorResponse(
  statusCode: number,
  message: string,
  correlationId?: string,
): ErrorResponse {
  return {
    statusCode,
    error: STATUS_CODES[statusCode] ?? 'Error',
    message,
    ...(correlationId && { correlationId }),
  };
}

export function correlationOf(req: {
  headers: Record<string, string | string[] | undefined>;
}): string | undefined {
  const value = req.headers[CORRELATION_HEADER];
  return typeof value === 'string' ? value : undefined;
}
