import { Inject, Injectable } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';

export const ID_TOKEN_SOURCE = Symbol('ID_TOKEN_SOURCE');
export const SERVICE_AUTH_OPTIONS = Symbol('SERVICE_AUTH_OPTIONS');
// Cloud Run checks this header and leaves Authorization free for the end-user JWT.
export const SERVERLESS_AUTH_HEADER = 'x-serverless-authorization';
const TOKEN_TTL_MS = 45 * 60 * 1000;

export interface ServiceAuthOptions {
  serviceAuth: 'google' | 'none';
}

export interface IdTokenSource {
  fetchIdToken(audience: string): Promise<string>;
}

export function googleIdTokenSource(): IdTokenSource {
  const auth = new GoogleAuth();
  return {
    async fetchIdToken(audience) {
      const client = await auth.getIdTokenClient(audience);
      return client.idTokenProvider.fetchIdToken(audience);
    },
  };
}

@Injectable()
export class IdentityTokens {
  private readonly cache = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    @Inject(SERVICE_AUTH_OPTIONS) private readonly options: ServiceAuthOptions,
    @Inject(ID_TOKEN_SOURCE) private readonly source: IdTokenSource,
  ) {}

  async headersFor(audience: string, now = Date.now()): Promise<Record<string, string>> {
    if (this.options.serviceAuth === 'none') return {};
    const cached = this.cache.get(audience);
    let token = cached && cached.expiresAt > now ? cached.token : undefined;
    if (!token) {
      token = await this.source.fetchIdToken(audience);
      this.cache.set(audience, { token, expiresAt: now + TOKEN_TTL_MS });
    }
    return { [SERVERLESS_AUTH_HEADER]: `Bearer ${token}` };
  }
}
