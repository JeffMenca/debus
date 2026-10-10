import {
  INBOX_TRANSACTION_MAX_WAIT_MS,
  INBOX_TRANSACTION_TIMEOUT_MS,
  SqlInboxStore,
  type SqlTransactional,
} from './sql-inbox-store';

function fakeDb(insertedRows: number) {
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(insertedRows),
    $queryRawUnsafe: jest.fn(),
  };
  const raw = {
    $executeRawUnsafe: jest.fn(),
    $queryRawUnsafe: jest.fn(),
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { db: raw as unknown as SqlTransactional, tx, raw };
}

const event = { eventId: 'e-1', type: 'SondeoEmitido' };

describe('SqlInboxStore', () => {
  it('runs the work once when the event is new', async () => {
    const { db, tx } = fakeDb(1);
    const work = jest.fn().mockResolvedValue(undefined);

    await expect(new SqlInboxStore(db).runOnce(event, work)).resolves.toBe('processed');
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (event_id) DO NOTHING'),
      'e-1',
      'SondeoEmitido',
    );
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('hands the transaction client to the work so handlers write in the same transaction', async () => {
    const { db, tx } = fakeDb(1);
    const work = jest.fn().mockResolvedValue(undefined);

    await new SqlInboxStore(db).runOnce(event, work);

    expect(work).toHaveBeenCalledWith(tx);
  });

  it('gives the transaction enough time for slow handlers', async () => {
    const { db, raw } = fakeDb(1);

    await new SqlInboxStore(db).runOnce(event, () => Promise.resolve());

    expect(INBOX_TRANSACTION_TIMEOUT_MS).toBe(30_000);
    expect(raw.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: INBOX_TRANSACTION_TIMEOUT_MS,
      maxWait: INBOX_TRANSACTION_MAX_WAIT_MS,
    });
  });

  it('waits for a free connection instead of failing a burst above the pool size', () => {
    expect(INBOX_TRANSACTION_MAX_WAIT_MS).toBe(10_000);
  });

  it('skips the work for a duplicate delivery', async () => {
    const { db } = fakeDb(0);
    const work = jest.fn();

    await expect(new SqlInboxStore(db).runOnce(event, work)).resolves.toBe('duplicate');
    expect(work).not.toHaveBeenCalled();
  });

  it('propagates handler failures so the transaction rolls back', async () => {
    const { db } = fakeDb(1);

    await expect(
      new SqlInboxStore(db).runOnce(event, () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
  });

  it('finds processed events', async () => {
    const { db, raw } = fakeDb(1);
    const row = { eventId: 'e-1', type: 'SondeoEmitido', processedAt: new Date() };
    raw.$queryRawUnsafe.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
    const store = new SqlInboxStore(db);

    await expect(store.findProcessed('e-1')).resolves.toEqual(row);
    await expect(store.findProcessed('e-2')).resolves.toBeNull();
  });
});
