import { createEnvelope, exampleRentalCancelled } from '@debus/contracts';
import { RentalCancelledHandler } from './rental-cancelled.handler';

jest.mock('../wallet/wallet-refunds', () => ({ refundDebit: jest.fn() }));
import { refundDebit } from '../wallet/wallet-refunds';

const envelope = createEnvelope('RentalCancelled', exampleRentalCancelled, 'c');
const { rentalId, cancelledAt } = exampleRentalCancelled;
const clientId = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';
const refund = refundDebit as jest.Mock;

const sqlClient = (cancelled: { client_id: string | null }[]) => ({
  $queryRawUnsafe: jest.fn().mockResolvedValue(cancelled),
  $executeRawUnsafe: jest.fn(),
});

describe('RentalCancelledHandler', () => {
  const outbox = { add: jest.fn() };
  const handler = new RentalCancelledHandler({} as never, outbox as never);

  beforeEach(() => refund.mockReset());

  it('cancels the paid rental and gives its wallet back what was charged', async () => {
    const tx = sqlClient([{ client_id: clientId }]);

    await handler.cancelled(exampleRentalCancelled, envelope, tx);

    const [[update, ...values]] = tx.$queryRawUnsafe.mock.calls;
    expect(update).toContain("SET status = 'CANCELLED'");
    expect(update).toContain("status <> 'CANCELLED'");
    expect(values).toEqual([rentalId, cancelledAt]);
    expect(refund).toHaveBeenCalledWith(tx, outbox, {
      reference: rentalId,
      clientId,
      debitKind: 'RENTAL',
      reason: 'RENTAL_CANCELLED',
      requestedAt: cancelledAt,
    });
  });

  it('only marks a counter rental: its cash is given back at the counter', async () => {
    await handler.cancelled(exampleRentalCancelled, envelope, sqlClient([{ client_id: null }]));

    expect(refund).not.toHaveBeenCalled();
  });

  it('does nothing for a rental already cancelled or unknown', async () => {
    await handler.cancelled(exampleRentalCancelled, envelope, sqlClient([]));

    expect(refund).not.toHaveBeenCalled();
  });
});
