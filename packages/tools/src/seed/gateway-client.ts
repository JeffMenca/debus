import { CORRELATION_HEADER, authTokensSchema, type SessionUser } from '@debus/contracts';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';

export class GatewayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export const isUnauthorized = (error: unknown): error is GatewayError =>
  error instanceof GatewayError && error.status === 401;

export interface Session {
  accessToken: string;
  user: SessionUser;
}

// What the stages need, so tests can stand in for the real gateway.
export type Gateway = Pick<GatewayClient, 'login' | 'request' | 'upload'>;

interface Credentials {
  email: string;
  password: string;
}

const JSON_TYPE = 'application/json';

async function failure(response: Response): Promise<GatewayError> {
  const text = await response.text();
  try {
    const { message } = JSON.parse(text) as { message?: unknown };
    if (typeof message === 'string') return new GatewayError(response.status, message);
  } catch {
    // Not a JSON error body: the status text is all there is.
  }
  return new GatewayError(response.status, response.statusText || `HTTP ${response.status}`);
}

// Talks to the gateway the way the web does. An access token lasts 15 minutes and a seed can last
// longer, so a session that expires signs in again once with the credentials it was created with.
export class GatewayClient {
  private readonly credentials = new WeakMap<Session, Credentials>();
  private readonly correlationId = `seed-${randomUUID()}`;
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async login(email: string, password: string): Promise<Session> {
    const tokens = await this.send(null, 'POST', '/api/administracion/auth/login', {
      email,
      password,
    }).then((body) => authTokensSchema.parse(body));
    const session: Session = { accessToken: tokens.accessToken, user: tokens.user };
    this.credentials.set(session, { email, password });
    return session;
  }

  async request<T>(
    session: Session | null,
    method: string,
    path: string,
    body?: unknown,
    schema?: z.ZodType<T>,
    headers?: Record<string, string>,
  ): Promise<T> {
    const data = await this.withRenewal(session, () =>
      this.send(session, method, path, body, headers),
    );
    if (!schema) return data as T;
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`Unexpected answer to ${method} ${path}: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  async upload(
    session: Session,
    path: string,
    file: { name: string; type: string; data: Buffer },
  ): Promise<void> {
    await this.withRenewal(session, async () => {
      const form = new FormData();
      form.set('photo', new File([new Uint8Array(file.data)], file.name, { type: file.type }));
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'PUT',
        headers: this.headers(session, false),
        body: form,
      });
      if (!response.ok) throw await failure(response);
    });
  }

  private async withRenewal<T>(session: Session | null, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const credentials = session && this.credentials.get(session);
      if (!isUnauthorized(error) || !session || !credentials) throw error;
      const renewed = await this.login(credentials.email, credentials.password);
      session.accessToken = renewed.accessToken;
      return work();
    }
  }

  private headers(session: Session | null, json: boolean): Headers {
    const headers = new Headers({ [CORRELATION_HEADER]: this.correlationId });
    if (json) headers.set('content-type', JSON_TYPE);
    if (session) headers.set('authorization', `Bearer ${session.accessToken}`);
    return headers;
  }

  private async send(
    session: Session | null,
    method: string,
    path: string,
    body?: unknown,
    extra?: Record<string, string>,
  ): Promise<unknown> {
    const hasBody = body !== undefined;
    const headers = this.headers(session, hasBody);
    for (const [name, value] of Object.entries(extra ?? {})) headers.set(name, value);
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(hasBody && { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw await failure(response);
    const text = await response.text();
    return text ? (JSON.parse(text) as unknown) : undefined;
  }
}
