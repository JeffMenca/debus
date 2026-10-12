import { BACKEND_SERVICES, type BackendService } from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { ServiceClient } from '../upstream/service-client';
import { mergeOpenApi } from './merge-openapi';

export const DOCS_CACHE_MS = 60_000;

@Injectable()
export class DocsService {
  private gateway: OpenAPIObject | null = null;
  private cached: { at: number; document: OpenAPIObject } | null = null;

  constructor(private readonly client: ServiceClient) {}

  useGatewayDocument(document: OpenAPIObject): void {
    this.gateway = document;
    this.cached = null;
  }

  async document(correlationId: string, now = Date.now()): Promise<OpenAPIObject> {
    if (!this.gateway) throw new Error('gateway document not set');
    if (this.cached && now - this.cached.at < DOCS_CACHE_MS) return this.cached.document;
    const services = await Promise.all(
      BACKEND_SERVICES.map(async (service) => ({
        service,
        document: await this.fetch(service, correlationId),
      })),
    );
    const document = mergeOpenApi(this.gateway, services);
    this.cached = { at: now, document };
    return document;
  }

  // A sleeping or failing service must not break the documentation of the others.
  private async fetch(
    service: BackendService,
    correlationId: string,
  ): Promise<OpenAPIObject | null> {
    try {
      const response = await this.client.get(service, '/docs-json', correlationId);
      return response.ok ? ((await response.json()) as OpenAPIObject) : null;
    } catch {
      return null;
    }
  }
}
