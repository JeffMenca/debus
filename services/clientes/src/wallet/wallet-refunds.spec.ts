import { refundDebit } from './wallet-refunds';

const clientId = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';
const rentalId = '6e5d4c3b-2a19-4f8e-9d7c-6b5a4f3e2d1c';
const refund = {
  reference: rentalId,
  clientId,
  debitKind: 'RENTAL' as const,
  reason: 'RENTAL_CANCELLED',
  requestedAt: '2026-10-22T14:00:00.000Z',
};

// The answers of the database, in the order it is asked: wallet lock, mark, debit, credit.
function sqlClient({ marked = true, debit = true } = {}) {
  return {
    $queryRawUnsafe: jest
      .fn()
      .mockResolvedValueOnce([{ client_id: clientId }])
      .mockResolvedValueOnce(marked ? [{ reference: rentalId }] : [])
      .mockResolvedValueOnce(
        debit ? [{ amount: -2500, description: 'Alquiler Quetzaltenango - Panajachel' }] : [],
      )
      .mockResolvedValueOnce([{ balance: 2600, email: 'ana@correo.com', full_name: 'Ana López' }]),
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
  };
}

describe('refundDebit', () => {
  const outbox = { add: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => outbox.add.mockClear());

  it('gives back what the debit of that kind took and tells the client', async () => {
    const sql = sqlClient();

    expect(await refundDebit(sql as never, outbox as never, refund)).toBe(2500);

    const [, [mark, ...markValues], [debit, ...debitValues]] = sql.$queryRawUnsafe.mock.calls;
    expect(mark).toContain('ON CONFLICT (reference) DO NOTHING');
    expect(markValues).toEqual([rentalId, clientId, 'RENTAL_CANCELLED']);
    expect(debit).toContain("kind = 'RENTAL'");
    expect(debitValues).toEqual([clientId, rentalId]);
    const [[movement, ...movementValues]] = sql.$executeRawUnsafe.mock.calls;
    expect(movement).toContain("'REFUND'");
    expect(movementValues).toEqual([
      expect.any(String),
      clientId,
      2500,
      2600,
      rentalId,
      'Devolución: Alquiler Quetzaltenango - Panajachel',
      '2026-10-22',
      `REFUND|250000|2026-10-22|${rentalId}`,
    ]);
    expect(outbox.add).toHaveBeenCalledWith(
      sql,
      'WalletCredited',
      expect.objectContaining({ kind: 'REFUND', amount: 2500, email: 'ana@correo.com' }),
    );
  });

  it('does nothing the second time, and only marks when nothing was charged', async () => {
    const again = sqlClient({ marked: false });
    expect(await refundDebit(again as never, outbox as never, refund)).toBeNull();
    expect(again.$queryRawUnsafe).toHaveBeenCalledTimes(2);

    const uncharged = sqlClient({ debit: false });
    expect(await refundDebit(uncharged as never, outbox as never, refund)).toBeNull();
    expect(uncharged.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
  });
});
