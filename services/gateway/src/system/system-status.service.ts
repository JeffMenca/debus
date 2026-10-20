import {
  BACKEND_SERVICES,
  type BackendService,
  type ServiceHealth,
  type SystemStatus,
  type UnitHealth,
  serviceHealthSchema,
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
    const response = await this.client.get(service, '/health', correlationId).catch(() => null);
    const circuits = response?.ok ? await this.circuitsOf(response) : undefined;
    return {
      unit: service,
      status: response?.ok ? 'up' : 'down',
      latencyMs: Date.now() - started,
      ...(circuits && { circuits }),
    };
  }

  // A revision that does not report circuits yet, or a body that is not JSON, only loses the connections.
  private async circuitsOf(response: Response): Promise<ServiceHealth['circuits'] | undefined> {
    const body: unknown = await response.json().catch(() => null);
    const parsed = serviceHealthSchema.safeParse(body);
    return parsed.success ? parsed.data.circuits : undefined;
  }
}
