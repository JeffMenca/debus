import {
  BACKEND_SERVICES,
  type BackendService,
  type SystemStatus,
  type UnitHealth,
} from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { GatewayConfig } from '../config/gateway-config';
import { ServiceClient } from '../upstream/service-client';

@Injectable()
export class SystemStatusService {
  constructor(
    private readonly config: GatewayConfig,
    private readonly client: ServiceClient,
  ) {}

  async check(correlationId: string): Promise<SystemStatus> {
    const backends = await Promise.all(
      BACKEND_SERVICES.map((service) => this.health(service, correlationId)),
    );
    return {
      environment: this.config.environment,
      checkedAt: new Date().toISOString(),
      units: [{ unit: 'gateway', status: 'up', latencyMs: 0 }, ...backends],
    };
  }

  private async health(service: BackendService, correlationId: string): Promise<UnitHealth> {
    const started = Date.now();
    const up = await this.client
      .get(service, '/health', correlationId)
      .then((response) => response.ok)
      .catch(() => false);
    return { unit: service, status: up ? 'up' : 'down', latencyMs: Date.now() - started };
  }
}
