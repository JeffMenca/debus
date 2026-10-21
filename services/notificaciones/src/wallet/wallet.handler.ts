import { type EventEnvelope, walletCreditedPayloadSchema } from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { emailKeys } from '../mail/email-keys';
import { EmailQueue } from '../mail/email-queue';
import { walletCreditedEmail } from './wallet-emails';

@Injectable()
export class WalletHandler {
  constructor(private readonly queue: EmailQueue) {}

  @OnEvent('WalletCredited')
  async credited(payload: unknown, envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const credit = walletCreditedPayloadSchema.parse(payload);
    await this.queue.enqueue(tx, [
      {
        eventId: envelope.eventId,
        dedupeKey: emailKeys.walletCredited(credit.movementId),
        template: credit.kind === 'REFUND' ? 'WALLET_REFUND' : 'WALLET_TOP_UP',
        message: walletCreditedEmail(credit),
      },
    ]);
  }
}
