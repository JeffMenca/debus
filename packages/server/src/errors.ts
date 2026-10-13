import { STATUS_CODES } from 'node:http';
import { CORRELATION_HEADER, type ErrorResponse } from '@debus/contracts';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SERVER_MESSAGES } from './messages';

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

// Failures of other services are thrown on purpose with a friendly text, so they are not hidden.
const SHOWN_SERVER_ERRORS: readonly number[] = [502, 503];

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500) this.logger.error(exception);
    const message =
      exception instanceof HttpException && (status < 500 || SHOWN_SERVER_ERRORS.includes(status))
        ? clientMessage(exception)
        : SERVER_MESSAGES.generic;
    http
      .getResponse<Response>()
      .status(status)
      .json(errorResponse(status, message, correlationOf(http.getRequest<Request>())));
  }
}

function clientMessage(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'string') return body;
  const { message } = body as { message?: string | string[] };
  return Array.isArray(message) ? message.join('. ') : (message ?? exception.message);
}
