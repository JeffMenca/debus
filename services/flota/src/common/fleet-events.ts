import type {
  BusChangedPayload,
  DriverChangedPayload,
  RouteChangedPayload,
  RouteDeletedPayload,
} from '@debus/contracts';
import { Outbox, REQUEST_FLUSH, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';

@Injectable()
export class FleetEvents {
  constructor(private readonly outbox: Outbox) {}

  async bus(
    tx: SqlClient,
    type: 'BusAdded' | 'BusUpdated' | 'BusDeactivated',
    payload: BusChangedPayload,
    correlationId?: string,
  ): Promise<void> {
    await this.outbox.add(tx, type, payload, correlationId);
  }

  async driver(
    tx: SqlClient,
    type: 'DriverAdded' | 'DriverUpdated',
    payload: DriverChangedPayload,
    correlationId?: string,
  ): Promise<void> {
    await this.outbox.add(tx, type, payload, correlationId);
  }

  async route(
    tx: SqlClient,
    type: 'RouteCreated' | 'RouteUpdated' | 'RouteDeleted',
    payload: RouteChangedPayload | RouteDeletedPayload,
    correlationId?: string,
  ): Promise<void> {
    await this.outbox.add(tx, type, payload, correlationId);
  }

  // Publishes right away; whatever fails stays in the outbox for the scheduled flush.
  async flush(): Promise<void> {
    await this.outbox.flush(REQUEST_FLUSH);
  }
}
