import { setTimeout as delay } from 'node:timers/promises';
import {
  BACKEND_SERVICES,
  type BackendService,
  CORRELATION_HEADER,
  type Circuit,
  serviceUrlVariable,
} from '@debus/contracts';
import { BadGatewayException, Logger } from '@nestjs/common';
import type { z } from 'zod';
import { CircuitBreaker, type CircuitOptions, isCircuitFailure } from './circuit-breaker';
import type { IdentityTokens } from './identity-tokens';
import { SERVER_MESSAGES } from './messages';
import { ServiceRejectedError, ServiceUnavailableError } from './service-errors';

export { CircuitOpenError, ServiceRejectedError, ServiceUnavailableError } from './service-errors';

export const SERVICE_TIMEOUT_MS = 3000;
export const READ_RETRIES = 2;
export const IDEMPOTENCY_HEADER = 'idempotency-key';

export interface ServiceCallOptions {
  correlationId?: string;
  idempotencyKey?: string;
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

  // One breaker per peer: a peer that is down is not called again until it had time to recover.
  private readonly breakers = new Map<BackendService, CircuitBreaker>();

  constructor(
    private readonly tokens: Pick<IdentityTokens, 'headersFor'>,
    private readonly urls: Partial<Record<BackendService, string>>,
    private readonly options: { retryDelayMs?: number; circuit?: CircuitOptions } = {},
  ) {
    for (const service of BACKEND_SERVICES) {
      if (!urls[service]) continue;
      this.breakers.set(
        service,
        new CircuitBreaker(service, options.circuit, (circuit) => this.logChange(circuit)),
      );
    }
  }

  // True only while the circuit is open: once the pause is over the next call goes through as a probe.
  isOpen(service: BackendService): boolean {
    return this.breakers.get(service)?.state() === 'open';
  }

  circuits(): Circuit[] {
    return [...this.breakers.values()].map((breaker) => breaker.snapshot());
  }

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
    const breaker = this.breakers.get(service);
    if (!base || !breaker) throw new Error(`No URL configured for ${service}`);
    for (let attempt = 0; ; attempt++) {
      breaker.admit();
      let cause: unknown;
      const response = await this.send(base, path, init, options).catch((error: unknown) => {
        cause = error;
        return null;
      });
      if (isCircuitFailure(response?.status ?? null)) breaker.failed();
      else breaker.succeeded();
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

  private logChange(circuit: Circuit): void {
    const verb = { open: 'opened', 'half-open': 'half-open', closed: 'closed' }[circuit.state];
    this.logger.warn({ service: circuit.target, failures: circuit.failures }, `Circuit ${verb}`);
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
