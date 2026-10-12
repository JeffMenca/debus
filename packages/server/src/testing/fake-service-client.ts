import type { BackendService } from '@debus/contracts';
import type { z } from 'zod';
import type { ServiceCallOptions, ServiceHttpClient } from '../service-client';

type Method = 'GET' | 'POST';

export interface RecordedCall {
  service: BackendService;
  method: Method;
  path: string;
  body: unknown;
  options: ServiceCallOptions | undefined;
}

const keyOf = (method: Method, service: BackendService, path: string) =>
  `${method} ${service} ${path.split('?')[0]}`;

// Stands in for ServiceHttpClient in tests: answers what was registered and records every call.
export class FakeServiceClient implements Pick<ServiceHttpClient, 'get' | 'post'> {
  readonly calls: RecordedCall[] = [];
  private readonly responses = new Map<string, unknown>();

  // An Error is thrown instead of returned, to simulate a peer that fails.
  respond(service: BackendService, method: Method, path: string, answer: unknown): void {
    this.responses.set(keyOf(method, service, path), answer);
  }

  async get<T>(
    service: BackendService,
    path: string,
    schema: z.ZodType<T>,
    options?: ServiceCallOptions,
  ): Promise<T> {
    return this.answer('GET', service, path, undefined, options, schema);
  }

  async post<T>(
    service: BackendService,
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    options: ServiceCallOptions,
  ): Promise<T> {
    return this.answer('POST', service, path, body, options, schema);
  }

  private answer<T>(
    method: Method,
    service: BackendService,
    path: string,
    body: unknown,
    options: ServiceCallOptions | undefined,
    schema: z.ZodType<T>,
  ): T {
    this.calls.push({ service, method, path, body, options });
    const key = keyOf(method, service, path);
    if (!this.responses.has(key)) {
      throw new Error(`No response registered for ${method} ${service} ${path.split('?')[0]}`);
    }
    const answer = this.responses.get(key);
    if (answer instanceof Error) throw answer;
    return schema.parse(answer);
  }
}
