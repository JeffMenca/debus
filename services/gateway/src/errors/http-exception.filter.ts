import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { MESSAGES, correlationOf, errorResponse } from './error-response';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500) this.logger.error(exception);
    const message =
      exception instanceof HttpException && status < 500
        ? clientMessage(exception)
        : MESSAGES.generic;
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
