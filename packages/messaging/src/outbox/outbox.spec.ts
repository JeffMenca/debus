import { exampleTripCompleted, type EventEnvelope } from '@debus/contracts';
import type { SqlClient } from '../inbox/sql-inbox-store';
import type { EventPublisher } from '../publishing/event-publisher';
import { InvalidEventPayloadError, Outbox } from './outbox';
import type { SqlOutboxStore } from './sql-outbox-store';

const NOW = '2026-10-13T10:00:00.000Z';
const event = (id: string) => ({ eventId: id, envelope: { eventId: id } as EventEnvelope });

function setup(claimed: ReturnType<typeof event>[] = []) {
  const store = {
    enqueue: jest.fn().mockResolvedValue(undefined),
    claim: jest.fn().mockResolvedValue(claimed),
    markPublished: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };
  const publisher = { publish: jest.fn().mockResolvedValue('message-id') };
  const outbox = new Outbox(
    store as unknown as SqlOutboxStore,
    publisher as unknown as EventPublisher,
  );
  return { store, publisher, outbox };
}

describe('Outbox.add', () => {
  it('writes an envelope inside the caller transaction', async () => {
    const { store, outbox } = setup();
    const tx = {} as SqlClient;

    const envelope = await outbox.add(tx, 'ProbeSent', { requestedAt: NOW }, 'c-1');

    expect(store.enqueue).toHaveBeenCalledWith(tx, envelope);
    expect(envelope).toMatchObject({ type: 'ProbeSent', correlationId: 'c-1' });
  });

  it('creates a correlation id when none arrives', async () => {
    const { outbox } = setup();

    const envelope = await outbox.add({} as SqlClient, 'ProbeSent', { requestedAt: NOW });

    expect(envelope.correlationId).toEqual(expect.any(String));
    expect(envelope.correlationId).not.toBe('');
  });
});

describe('Outbox.add payload contract', () => {
  it('queues a payload that fits its schema as it came', async () => {
    const { store, outbox } = setup();

    const envelope = await outbox.add({} as SqlClient, 'TripCompleted', exampleTripCompleted);

    expect(envelope.payload).toBe(exampleTripCompleted);
    expect(store.enqueue).toHaveBeenCalledTimes(1);
  });

  it('refuses a payload that breaks its schema and queues nothing', async () => {
    const { store, outbox } = setup();
    const tooBig = { ...exampleTripCompleted, depreciationAmount: 1_134_000 };

    const attempt = outbox.add({} as SqlClient, 'TripCompleted', tooBig);

    await expect(attempt).rejects.toBeInstanceOf(InvalidEventPayloadError);
    await expect(attempt).rejects.toThrow(/TripCompleted.*depreciationAmount/);
    expect(store.enqueue).not.toHaveBeenCalled();
  });
});

describe('Outbox.flush', () => {
  it('claims up to the limit and marks each published event', async () => {
    const { store, publisher, outbox } = setup([event('a'), event('b')]);

    const result = await outbox.flush({ limit: 7 });

    expect(result).toEqual({ published: 2, failed: 0 });
    expect(store.claim).toHaveBeenCalledWith(7, expect.any(Number));
    expect(publisher.publish).toHaveBeenCalledTimes(2);
    expect(store.markPublished.mock.calls).toEqual([['a'], ['b']]);
  });

  it('keeps the lease at 60 s for the default budget', async () => {
    const { store, outbox } = setup();

    await outbox.flush();

    expect(store.claim).toHaveBeenCalledWith(100, 60_000);
  });

  it('never lets the lease be shorter than the budget plus one publication', async () => {
    const { store, outbox } = setup();

    await outbox.flush({ budgetMs: 90_000, publishTimeoutMs: 5_000 });

    expect(store.claim).toHaveBeenCalledWith(100, 95_000);
  });

  it('uses a limit of 100 by default', async () => {
    const { store, outbox } = setup();

    await outbox.flush();

    expect(store.claim).toHaveBeenCalledWith(100, expect.any(Number));
  });

  it('records the error of a failed publication and keeps publishing the rest', async () => {
    const { store, publisher, outbox } = setup([event('a'), event('b')]);
    publisher.publish.mockRejectedValueOnce(new Error('unavailable'));

    const result = await outbox.flush();

    expect(result).toEqual({ published: 1, failed: 1 });
    expect(store.markFailed).toHaveBeenCalledWith('a', 'unavailable');
    expect(store.markPublished).toHaveBeenCalledWith('b');
  });

  it('records a rejection that is not an Error as text', async () => {
    const { store, publisher, outbox } = setup([event('a')]);
    publisher.publish.mockRejectedValueOnce('plain text');

    await outbox.flush();

    expect(store.markFailed).toHaveBeenCalledWith('a', 'plain text');
  });

  it('treats a publication that exceeds its time limit as a failure', async () => {
    const { store, publisher, outbox } = setup([event('a')]);
    publisher.publish.mockReturnValue(new Promise(() => undefined));

    const result = await outbox.flush({ publishTimeoutMs: 20 });

    expect(result).toEqual({ published: 0, failed: 1 });
    expect(store.markFailed).toHaveBeenCalledWith('a', 'Publication timed out after 20 ms');
  });

  it('returns within its budget even if a publication never resolves', async () => {
    const { publisher, outbox } = setup([event('a'), event('b')]);
    publisher.publish.mockReturnValue(new Promise(() => undefined));
    const startedAt = Date.now();

    const result = await outbox.flush({ budgetMs: 50, publishTimeoutMs: 60_000 });

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(result.published).toBe(0);
  });

  it('stops starting publications once the budget is spent and releases the rest', async () => {
    const { store, publisher, outbox } = setup([event('a'), event('b'), event('c')]);
    let clock = 1_000_000;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    publisher.publish.mockImplementation(() => {
      clock += 40;
      return Promise.resolve('id');
    });

    const result = await outbox.flush({ budgetMs: 30 });
    now.mockRestore();

    expect(result).toEqual({ published: 1, failed: 0 });
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(store.release).toHaveBeenCalledWith(['b', 'c']);
  });

  it('caps a publication at the budget that is left', async () => {
    const { store, publisher, outbox } = setup([event('a')]);
    publisher.publish.mockReturnValue(new Promise(() => undefined));

    await outbox.flush({ budgetMs: 25, publishTimeoutMs: 60_000 });

    expect(store.markFailed).toHaveBeenCalledWith(
      'a',
      expect.stringMatching(/^Publication timed out after \d+ ms$/),
    );
  });

  it('does not release anything when every claimed event was attempted', async () => {
    const { store, outbox } = setup([event('a')]);

    await outbox.flush();

    expect(store.release).not.toHaveBeenCalled();
  });

  it('never throws when the claim fails', async () => {
    const { store, outbox } = setup();
    store.claim.mockRejectedValue(new Error('db down'));

    await expect(outbox.flush()).resolves.toEqual({ published: 0, failed: 0 });
  });

  it('never throws when marking fails and keeps the result so far', async () => {
    const { store, outbox } = setup([event('a'), event('b')]);
    store.markPublished
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('db down'));

    await expect(outbox.flush()).resolves.toEqual({ published: 1, failed: 0 });
  });

  it('survives a non-Error failure of the database', async () => {
    const { store, outbox } = setup();
    store.claim.mockRejectedValue('db down');

    await expect(outbox.flush()).resolves.toEqual({ published: 0, failed: 0 });
  });
});
