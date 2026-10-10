import { createEnvelope } from '@debus/contracts';
import type { SqlClient } from '../inbox/sql-inbox-store';
import { SqlOutboxStore } from './sql-outbox-store';

const envelope = createEnvelope('SondeoEmitido', { requestedAt: '2026-10-09T12:00:00.000Z' }, 'c');

function fakeDb(rows: unknown[] = []) {
  const db = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    $queryRawUnsafe: jest.fn().mockResolvedValue(rows),
  };
  return { db, client: db as unknown as SqlClient };
}

describe('SqlOutboxStore', () => {
  it('stores the envelope with the caller transaction', async () => {
    const { client } = fakeDb();
    const tx = fakeDb();

    await new SqlOutboxStore(client).enqueue(tx.client, envelope);

    expect(tx.db.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO outbox'),
      envelope.eventId,
      envelope.type,
      JSON.stringify(envelope),
    );
  });

  it('claims pending events with a lease in a single statement', async () => {
    const { db, client } = fakeDb([{ eventId: envelope.eventId, envelope }]);

    const claimed = await new SqlOutboxStore(client).claim(100, 60_000);

    const [sql, limit, leaseSeconds] = db.$queryRawUnsafe.mock.calls[0] as unknown[];
    expect(sql).toEqual(expect.stringContaining('FOR UPDATE SKIP LOCKED'));
    expect(sql).toEqual(expect.stringContaining('claimed_until'));
    expect([limit, leaseSeconds]).toEqual([100, 60]);
    expect(claimed).toEqual([{ eventId: envelope.eventId, envelope }]);
  });

  it('returns claimed events oldest first', async () => {
    const { db, client } = fakeDb();

    await new SqlOutboxStore(client).claim(10, 60_000);

    expect(db.$queryRawUnsafe.mock.calls[0]?.[0]).toMatch(/FROM claimed ORDER BY created_at/);
  });

  it('accepts an envelope the driver returns as a JSON string', async () => {
    const { client } = fakeDb([{ eventId: envelope.eventId, envelope: JSON.stringify(envelope) }]);

    const [claimed] = await new SqlOutboxStore(client).claim(1, 1000);

    expect(claimed?.envelope).toEqual(envelope);
  });

  it('marks an event as published', async () => {
    const { db, client } = fakeDb();

    await new SqlOutboxStore(client).markPublished('e-1');

    expect(db.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('published_at = now()'),
      'e-1',
    );
  });

  it('forgets the payload when the event is published', async () => {
    const { db, client } = fakeDb();

    await new SqlOutboxStore(client).markPublished('e-1');

    expect(db.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("envelope = envelope - 'payload'"),
      'e-1',
    );
  });

  it('records a failure, counts the attempt and releases the claim', async () => {
    const { db, client } = fakeDb();

    await new SqlOutboxStore(client).markFailed('e-1', 'unavailable');

    expect(db.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringMatching(/attempts = attempts \+ 1.*claimed_until = NULL/),
      'e-1',
      'unavailable',
    );
  });

  it('releases claimed events that were not attempted', async () => {
    const { db, client } = fakeDb();

    await new SqlOutboxStore(client).release(['a', 'b']);

    expect(db.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('claimed_until = NULL'),
      ['a', 'b'],
    );
  });

  it('does not touch the database when there is nothing to release', async () => {
    const { db, client } = fakeDb();

    await new SqlOutboxStore(client).release([]);

    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
