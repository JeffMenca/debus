import type { AccountLinkSentPayload, UserRegisteredPayload } from '@debus/contracts';
import { Outbox, REQUEST_FLUSH, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AccountEvents {
  constructor(private readonly outbox: Outbox) {}

  async linkSent(
    tx: SqlClient,
    payload: AccountLinkSentPayload,
    correlationId?: string,
  ): Promise<void> {
    await this.outbox.add(tx, 'AccountLinkSent', payload, correlationId);
  }

  async userRegistered(
    tx: SqlClient,
    payload: UserRegisteredPayload,
    correlationId?: string,
  ): Promise<void> {
    await this.outbox.add(tx, 'UserRegistered', payload, correlationId);
  }

  // Publishes right away; whatever fails stays in the outbox for the scheduled flush.
  async flush(): Promise<void> {
    await this.outbox.flush(REQUEST_FLUSH);
  }
}
