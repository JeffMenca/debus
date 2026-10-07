import { InMemoryInboxStore } from './in-memory-inbox-store';

const event = { eventId: 'e', type: 'SondeoEmitido' };

describe('InMemoryInboxStore', () => {
  it('processes each event id once and remembers it', async () => {
    const store = new InMemoryInboxStore();
    const work = jest.fn().mockResolvedValue(undefined);

    expect(await store.runOnce(event, work)).toBe('processed');
    expect(await store.runOnce(event, work)).toBe('duplicate');
    expect(work).toHaveBeenCalledTimes(1);
    expect(await store.findProcessed('e')).toMatchObject(event);
    expect(await store.findProcessed('x')).toBeNull();
  });

  it('forgets the event when the work fails', async () => {
    const store = new InMemoryInboxStore();

    await expect(store.runOnce(event, () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(await store.findProcessed('e')).toBeNull();
  });
});
