import { deadLetterListQuerySchema, deadLetterSchema, replayResultSchema } from './dead-letters';

describe('dead-letter contracts', () => {
  it('reads at most 100 messages, 20 by default', () => {
    expect(deadLetterListQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(deadLetterListQuerySchema.parse({ limit: '100' })).toEqual({ limit: 100 });
    expect(deadLetterListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(deadLetterListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('keeps a message whose data is not an event', () => {
    expect(
      deadLetterSchema.parse({
        messageId: '42',
        eventId: null,
        type: null,
        correlationId: null,
        publishedAt: '2026-10-13T15:00:00.000Z',
        deliveryAttempts: null,
        payload: 'not json',
      }),
    ).toMatchObject({ messageId: '42', payload: 'not json' });
  });

  it('tells whether the replay processed the event or it was already done', () => {
    expect(replayResultSchema.parse({ outcome: 'duplicate' })).toEqual({ outcome: 'duplicate' });
    expect(replayResultSchema.safeParse({ outcome: 'skipped' }).success).toBe(false);
  });
});
