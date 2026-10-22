import { type EventEnvelope, rentalPaidPayloadSchema } from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { emailKeys } from '../mail/email-keys';
import { EmailQueue } from '../mail/email-queue';
import { rentalPaidEmail } from './rental-email';

@Injectable()
export class RentalsHandler {
  constructor(private readonly queue: EmailQueue) {}

  @OnEvent('RentalPaid')
  async paid(payload: unknown, envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const rental = rentalPaidPayloadSchema.parse(payload);
    if (!rental.email) return;
    await this.queue.enqueue(tx, [
      {
        eventId: envelope.eventId,
        dedupeKey: emailKeys.rentalPaid(rental.rentalId),
        template: 'RENTAL_PAID',
        message: rentalPaidEmail({ ...rental, email: rental.email }),
      },
    ]);
  }
}
