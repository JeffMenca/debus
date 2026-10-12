import { setTimeout as delay } from 'node:timers/promises';
import {
  BACKEND_SERVICES,
  type BackendService,
  CORRELATION_HEADER,
  serviceUrlVariable,
} from '@debus/contracts';
import {
  BadGatewayException,
  HttpException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { z } from 'zod';
import type { IdentityTokens } from './identity-tokens';
import { SERVER_MESSAGES } from './messages';

export const SERVICE_TIMEOUT_MS = 3000;
export const READ_RETRIES = 2;
export const IDEMPOTENCY_HEADER = 'idempotency-key';

export interface ServiceCallOptions {
  correlationId?: string;
  idempotencyKey?: string;
}

export class ServiceUnavailableError extends ServiceUnavailableException {
  constructor() {
    super(SERVER_MESSAGES.upstream);
  }
}

// A 4xx keeps its status and the peer's message, so the caller can turn it into its own rule.
export class ServiceRejectedError extends HttpException {
  constructor(
    status: number,
    readonly body: unknown,
  ) {
    super((body as { message?: string } | null)?.message ?? SERVER_MESSAGES.generic, status);
  }
}

const isRetryableStatus = (status: number) => status === 429 || status >= 500;
// The refusals a caller turns into its own rules; any other 4xx (a rejected identity token, a wrong
// path) is a problem between the services, and the person must not see it as their own session or data.
const BUSINESS_STATUSES: readonly number[] = [400, 404, 409, 422];

// The peers this service may call, read from the SERVICE_URL_<NAME> variables of its environment.
export function serviceUrlsFromEnv(
  env: Record<string, string | undefined>,
): Partial<Record<BackendService, string>> {
  const urls: Partial<Record<BackendService, string>> = {};
  for (const service of BACKEND_SERVICES) {
    const url = env[serviceUrlVariable(service)];
    if (url) urls[service] = url;
  }
  return urls;
}

export class ServiceHttpClient {
  private readonly logger = new Logger(ServiceHttpClient.name);

  constructor(
    private readonly tokens: Pick<IdentityTokens, 'headersFor'>,
    private readonly urls: Partial<Record<BackendService, string>>,
    private readonly options: { retryDelayMs?: number } = {},
  ) {}

  get<T>(
    service: BackendService,
    path: string,
    schema: z.ZodType<T>,
    options: ServiceCallOptions = {},
  ): Promise<T> {
    return this.call(service, path, schema, { method: 'GET' }, options, READ_RETRIES);
  }

  // Writes are never retried here: the caller owns the Idempotency-Key and decides.
  post<T>(
    service: BackendService,
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    options: ServiceCallOptions,
  ): Promise<T> {
    return this.call(
      service,
      path,
      schema,
      { method: 'POST', body: JSON.stringify(body) },
      options,
      0,
    );
  }

  private async call<T>(
    service: BackendService,
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit,
    options: ServiceCallOptions,
    retries: number,
  ): Promise<T> {
    const base = this.urls[service];
    if (!base) throw new Error(`No URL configured for ${service}`);
    for (let attempt = 0; ; attempt++) {
      let cause: unknown;
      const response = await this.send(base, path, init, options).catch((error: unknown) => {
        cause = error;
        return null;
      });
      const last = attempt >= retries;
      if (!response || isRetryableStatus(response.status)) {
        this.logFailure(service, path, options, response?.status, cause);
        if (last) throw new ServiceUnavailableError();
      } else {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          if (BUSINESS_STATUSES.includes(response.status)) {
            throw new ServiceRejectedError(response.status, body);
          }
          this.logFailure(service, path, options, response.status);
          throw new BadGatewayException(SERVER_MESSAGES.upstream);
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) throw new BadGatewayException(SERVER_MESSAGES.upstream);
        return parsed.data;
      }
      await delay((this.options.retryDelayMs ?? 200) * 2 ** attempt);
    }
  }

  // One line per failed attempt, so a 503 on the screen can be traced to its cause; the query is left out.
  private logFailure(
    service: BackendService,
    path: string,
    options: ServiceCallOptions,
    status?: number,
    cause?: unknown,
  ): void {
    this.logger.warn(
      {
        service,
        path: path.split('?')[0],
        correlationId: options.correlationId,
        ...(status !== undefined && { status }),
        ...(cause instanceof Error && { cause: cause.message }),
      },
      'Call to another service failed',
    );
  }

  private async send(
    base: string,
    path: string,
    init: RequestInit,
    options: ServiceCallOptions,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(await this.tokens.headersFor(base)),
      ...(options.correlationId && { [CORRELATION_HEADER]: options.correlationId }),
      ...(options.idempotencyKey && { [IDEMPOTENCY_HEADER]: options.idempotencyKey }),
    };
    return fetch(`${base}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
    });
  }
}
