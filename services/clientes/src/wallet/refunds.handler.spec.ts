import { createEnvelope, exampleRefundRequested } from '@debus/contracts';
import { RefundsHandler } from './refunds.handler';

const envelope = createEnvelope('RefundRequested', exampleRefundRequested, 'c');
const { ticketId, clientId, amount } = exampleRefundRequested;

// The answers of the database, in the order the handler asks: wallet lock, mark, debit, credit.
function sqlClient({
  marked = true,
  debit = { amount: -amount, description: 'Boleto Quetzaltenango - Guatemala, asientos 3 y 4' },
}: { marked?: boolean; debit?: { amount: number; description: string } | null } = {}) {
  return {
    $queryRawUnsafe: jest
      .fn()
      .mockResolvedValueOnce([{ client_id: clientId }])
      .mockResolvedValueOnce(marked ? [{ reference: ticketId }] : [])
      .mockResolvedValueOnce(debit ? [debit] : [])
      .mockResolvedValueOnce([{ balance: 100 }]),
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
  };
}

describe('RefundsHandler', () => {
  const handler = new RefundsHandler({} as never);

  it('locks the wallet, marks the ticket and gives back what its debit took', async () => {
    const tx = sqlClient();

    await handler.requested(exampleRefundRequested, envelope, tx);

    const [
      [lock, ...lockValues],
      [mark, ...markValues],
      [debit, ...debitValues],
      [credit, ...creditValues],
    ] = tx.$queryRawUnsafe.mock.calls;
    expect(lock).toContain('FOR UPDATE');
    expect(lockValues).toEqual([clientId]);
    expect(mark).toContain('ON CONFLICT (reference) DO NOTHING');
    expect(markValues).toEqual([ticketId, clientId, 'TRIP_DELETED']);
    expect(debit).toContain("kind = 'TICKET'");
    expect(debitValues).toEqual([clientId, ticketId]);
    expect(credit).toContain('balance = balance +');
    expect(creditValues).toEqual([clientId, amount]);

    const [[movement, ...movementValues], [settle, ...settleValues]] =
      tx.$executeRawUnsafe.mock.calls;
    expect(movement).toContain("'REFUND'");
    expect(movementValues).toEqual([
      expect.any(String),
      clientId,
      amount,
      100,
      ticketId,
      'Devolución: Boleto Quetzaltenango - Guatemala, asientos 3 y 4',
      '2026-10-15',
      `REFUND|${amount * 100}|2026-10-15|${ticketId}`,
    ]);
    expect(settle).toContain('UPDATE refunds');
    expect(settleValues).toEqual([ticketId, movementValues[0], amount]);
  });

  it('does nothing more for a ticket it already refunded', async () => {
    const tx = sqlClient({ marked: false });

    await handler.requested(exampleRefundRequested, envelope, tx);

    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('only leaves the mark when nothing had been charged', async () => {
    const tx = sqlClient({ debit: null });

    await handler.requested(exampleRefundRequested, envelope, tx);

    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(3);
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('gives back the amount of the debit even when the request says otherwise', async () => {
    const tx = sqlClient({ debit: { amount: -70, description: 'Boleto' } });
    const payload = { ...exampleRefundRequested, amount: 85 };

    await handler.requested(payload, envelope, tx);

    expect(tx.$queryRawUnsafe.mock.calls[3]).toEqual([expect.any(String), clientId, 70]);
  });

  it('uses the service client when the inbox gives no transaction', async () => {
    const prisma = sqlClient();

    await new RefundsHandler(prisma as never).requested(exampleRefundRequested, envelope);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('rejects a malformed payload before writing', async () => {
    const tx = sqlClient();

    await expect(handler.requested({ ticketId: 'x' }, envelope, tx)).rejects.toThrow();
    expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
