import { type EventEnvelope, accountLinkIssuedPayloadSchema } from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { Mailer } from '../mail/mailer';
import { PrismaService } from '../prisma/prisma.service';
import { accountLinkEmail } from './account-link-email';

@Injectable()
export class AccountLinkHandler {
  constructor(
    private readonly mailer: Mailer,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('EnlaceDeCuentaEmitido')
  async handle(payload: unknown, envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const parsed = accountLinkIssuedPayloadSchema.parse(payload);
    await this.mailer.send(accountLinkEmail(parsed));
    // The link is deliberately not stored: the ledger keeps who got which kind of email.
    await this.ledger(tx).sentEmail.create({
      data: { eventId: envelope.eventId, recipient: parsed.email, template: parsed.reason },
    });
  }

  // The inbox hands over the Prisma transaction client; writing through it avoids a second pool connection.
  private ledger(tx: SqlClient | undefined): Pick<Prisma.TransactionClient, 'sentEmail'> {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }
}
