import { createEnvelope, exampleRentalConfirmed, exampleRentalPaid } from '@debus/contracts';
import { RentalsHandler } from './rentals.handler';

describe('RentalsHandler', () => {
  it('queues the confirmation of a paid rental with an email', async () => {
    const queue = { enqueue: jest.fn().mockResolvedValue(1) };
    const envelope = createEnvelope('RentalPaid', exampleRentalPaid, 'c');

    await new RentalsHandler(queue as never).paid(exampleRentalPaid, envelope);

    expect(queue.enqueue).toHaveBeenCalledWith(undefined, [
      expect.objectContaining({
        dedupeKey: `rental-paid:${exampleRentalPaid.rentalId}`,
        template: 'RENTAL_PAID',
        message: expect.objectContaining({ to: exampleRentalPaid.email }),
      }),
    ]);
  });

  it('sends nothing for a walk-in client without email and rejects an invalid payload', async () => {
    const queue = { enqueue: jest.fn() };
    const handler = new RentalsHandler(queue as never);
    const walkIn = { ...exampleRentalPaid, email: null };

    await handler.paid(walkIn, createEnvelope('RentalPaid', walkIn, 'c'));
    await expect(handler.paid({}, createEnvelope('RentalPaid', {}, 'c'))).rejects.toThrow();

    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('queues the quote of a confirmed online rental once per rental', async () => {
    const queue = { enqueue: jest.fn().mockResolvedValue(1) };
    const envelope = createEnvelope('RentalConfirmed', exampleRentalConfirmed, 'c');
    const tx = {} as never;

    await new RentalsHandler(queue as never).confirmed(exampleRentalConfirmed, envelope, tx);

    expect(queue.enqueue).toHaveBeenCalledWith(tx, [
      {
        eventId: envelope.eventId,
        dedupeKey: `rental-confirmed:${exampleRentalConfirmed.rentalId}`,
        template: 'RENTAL_CONFIRMED',
        message: expect.objectContaining({
          to: exampleRentalConfirmed.email,
          subject: 'Tu cotización está lista',
        }),
      },
    ]);
  });
});
