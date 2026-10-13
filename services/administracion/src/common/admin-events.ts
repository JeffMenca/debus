import type { BranchChangedPayload, SettingsUpdatedPayload } from '@debus/contracts';
import { Outbox, REQUEST_FLUSH, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminEvents {
  constructor(private readonly outbox: Outbox) {}

  async branchChanged(
    tx: SqlClient,
    type: 'BranchCreated' | 'BranchUpdated',
    payload: BranchChangedPayload,
    correlationId?: string,
  ): Promise<void> {
    await this.outbox.add(tx, type, payload, correlationId);
  }

  async settingsUpdated(
    tx: SqlClient,
    payload: SettingsUpdatedPayload,
    correlationId?: string,
  ): Promise<void> {
    await this.outbox.add(tx, 'SettingsUpdated', payload, correlationId);
  }

  // Publishes right away; whatever fails stays in the outbox for the scheduled flush.
  async flush(): Promise<void> {
    await this.outbox.flush(REQUEST_FLUSH);
  }
}
