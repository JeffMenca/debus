import { createEnvelope, eventEnvelopeSchema } from './envelope';

describe('event envelope', () => {
  it('creates a valid envelope with a fresh id', () => {
    const envelope = createEnvelope(
      'ProbeSent',
      { requestedAt: '2026-10-06T12:00:00.000Z' },
      'c-1',
    );

    expect(eventEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(envelope).toMatchObject({ type: 'ProbeSent', version: 1, correlationId: 'c-1' });
    expect(createEnvelope('ProbeSent', {}, 'c-1').eventId).not.toBe(envelope.eventId);
  });

  it('rejects unknown event types', () => {
    const result = eventEnvelopeSchema.safeParse({
      ...createEnvelope('ProbeSent', {}, 'c-1'),
      type: 'Inventado',
    });

    expect(result.success).toBe(false);
  });
});
