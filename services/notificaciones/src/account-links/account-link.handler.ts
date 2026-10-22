import { type EventEnvelope, accountLinkSentPayloadSchema } from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { Mailer } from '../mail/mailer';
import { PrismaService } from '../prisma/prisma.service';
import { inTransaction } from '../prisma/transaction';
import { accountLinkEmail } from './account-link-email';

@Injectable()
export class AccountLinkHandler {
  constructor(
    private readonly mailer: Mailer,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('AccountLinkSent')
  async handle(payload: unknown, envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const parsed = accountLinkSentPayloadSchema.parse(payload);
    await this.mailer.send(accountLinkEmail(parsed));
    // Sent right away and stored without its content: the link is a secret.
    await inTransaction(tx, this.prisma).sentEmail.create({
      data: {
        eventId: envelope.eventId,
        dedupeKey: `account-link:${envelope.eventId}`,
        recipient: parsed.email,
        template: parsed.reason,
        status: 'SENT',
        sentAt: new Date(),
      },
    });
  }
}
