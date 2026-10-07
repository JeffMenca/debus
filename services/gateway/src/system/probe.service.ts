import {
  type BackendService,
  type ProbeCreated,
  type ProbeDelivery,
  type ProbeStatus,
  consumersOf,
  createEnvelope,
} from '@debus/contracts';
import { EventPublisher } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { ServiceClient } from '../upstream/service-client';

@Injectable()
export class ProbeService {
  constructor(
    private readonly publisher: EventPublisher,
    private readonly client: ServiceClient,
  ) {}

  async emit(correlationId: string): Promise<ProbeCreated> {
    const envelope = createEnvelope(
      'SondeoEmitido',
      { requestedAt: new Date().toISOString() },
      correlationId,
    );
    await this.publisher.publish(envelope);
    return { probeId: envelope.eventId };
  }

  async status(probeId: string, correlationId: string): Promise<ProbeStatus> {
    const services = await Promise.all(
      consumersOf('SondeoEmitido').map((service) => this.delivery(service, probeId, correlationId)),
    );
    return { probeId, services };
  }

  private async delivery(
    service: BackendService,
    probeId: string,
    correlationId: string,
  ): Promise<ProbeDelivery> {
    try {
      const response = await this.client.get(
        service,
        `/events/processed/${probeId}`,
        correlationId,
      );
      if (response.status === 404) return { service, state: 'pending' };
      if (!response.ok) return { service, state: 'unreachable' };
      const { processedAt } = (await response.json()) as { processedAt: string };
      return { service, state: 'received', receivedAt: new Date(processedAt).toISOString() };
    } catch {
      return { service, state: 'unreachable' };
    }
  }
}
