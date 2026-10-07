import { type BackendService, CORRELATION_HEADER } from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { GatewayConfig } from '../config/gateway-config';
import { IdentityTokens } from './identity-tokens';

export const UPSTREAM_TIMEOUT_MS = 10_000;

@Injectable()
export class ServiceClient {
  constructor(
    private readonly config: GatewayConfig,
    private readonly tokens: IdentityTokens,
  ) {}

  async get(service: BackendService, path: string, correlationId: string): Promise<Response> {
    const base = this.config.serviceUrls[service];
    const headers = {
      ...(await this.tokens.headersFor(base)),
      [CORRELATION_HEADER]: correlationId,
    };
    return fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  }
}
