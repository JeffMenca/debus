import type { IncomingMessage, ServerResponse } from 'node:http';
import { correlationIdFor } from '@debus/messaging';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { createProxyMiddleware, fixRequestBody, type RequestHandler } from 'http-proxy-middleware';
import { GatewayConfig } from '../config/gateway-config';
import { MESSAGES, correlationOf, errorResponse } from '../errors/error-response';
import { IdentityTokens } from '../upstream/identity-tokens';
import { type ProxyResolution, resolveProxyTarget } from './proxy-target';

type ServiceResolution = Extract<ProxyResolution, { kind: 'service' }>;
const PROXY_TIMEOUT_MS = 15_000;

@Injectable()
export class ProxyMiddleware implements NestMiddleware {
  private readonly resolutions = new WeakMap<IncomingMessage, ServiceResolution>();
  private readonly proxy: RequestHandler<Request, Response>;

  constructor(
    private readonly config: GatewayConfig,
    private readonly tokens: IdentityTokens,
  ) {
    this.proxy = createProxyMiddleware<Request, Response>({
      router: (req) => this.resolutionOf(req).target,
      pathRewrite: (_path, req) => this.resolutionOf(req).path,
      changeOrigin: true,
      proxyTimeout: PROXY_TIMEOUT_MS,
      on: {
        // Nest already parsed the JSON body; stream it again to the service.
        proxyReq: fixRequestBody,
        error: (_error, req, res) => sendUpstreamError(req, res),
      },
    });
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const correlationId = correlationIdFor(req, res);
    const resolution = resolveProxyTarget(req.originalUrl, this.config.serviceUrls);
    if (resolution.kind === 'not-found') {
      res.status(404).json(errorResponse(404, MESSAGES.notFound, correlationId));
      return;
    }
    Object.assign(req.headers, await this.tokens.headersFor(resolution.target));
    this.resolutions.set(req, resolution);
    await this.proxy(req, res, next);
  }

  private resolutionOf(req: IncomingMessage): ServiceResolution {
    const resolution = this.resolutions.get(req);
    if (!resolution) throw new Error('Proxy request was not resolved');
    return resolution;
  }
}

// The proxy may hand over a raw socket instead of a response on upgrade errors.
function sendUpstreamError(req: IncomingMessage, res: unknown): void {
  if (typeof res !== 'object' || res === null || !('writeHead' in res)) return;
  const response = res as ServerResponse;
  if (response.headersSent) return;
  const body = errorResponse(502, MESSAGES.upstream, correlationOf(req));
  response.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}
