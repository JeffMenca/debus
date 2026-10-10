import type { AccountLinkIssuedPayload, UserRegisteredPayload } from '@debus/contracts';
import { Outbox, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AccountEvents {
  constructor(private readonly outbox: Outbox) {}

  async linkIssued(
    tx: SqlClient,
    payload: AccountLinkIssuedPayload,
    correlationId?: string,
  ): Promise<void> {
    await this.outbox.add(tx, 'EnlaceDeCuentaEmitido', payload, correlationId);
  }

  async userRegistered(
    tx: SqlClient,
    payload: UserRegisteredPayload,
    correlationId?: string,
  ): Promise<void> {
    await this.outbox.add(tx, 'UsuarioRegistrado', payload, correlationId);
  }

  // Publishes right away; whatever fails stays in the outbox for the scheduled flush.
  async flush(): Promise<void> {
    // Request path: short budget so a slow Pub/Sub never holds the user's request.
    await this.outbox.flush({ limit: 10, budgetMs: 2000 });
  }
}
