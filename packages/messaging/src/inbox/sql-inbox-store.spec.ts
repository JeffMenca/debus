import { SqlInboxStore, type SqlTransactional } from './sql-inbox-store';

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
