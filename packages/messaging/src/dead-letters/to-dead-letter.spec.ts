import { createEnvelope, exampleTicketSold } from '@debus/contracts';
import type { PulledMessage } from './dead-letter-queue';
import { toDeadLetter } from './to-dead-letter';

const publishedAt = new Date('2026-10-13T15:00:00.000Z');
const pulled = (data: string, attributes: Record<string, string> = {}): PulledMessage => ({
  ackId: 'ack-1',
  messageId: '42',
  data: Buffer.from(data),
  attributes,
  publishedAt,
});

describe('toDeadLetter', () => {
  it('shows the event, its payload and how many times Pub/Sub tried it', () => {
    const envelope = createEnvelope('TicketSold', exampleTicketSold, 'corr-1');

    expect(
      toDeadLetter(
        pulled(JSON.stringify(envelope), { CloudPubSubDeadLetterSourceDeliveryCount: '5' }),
      ),
    ).toEqual({
      messageId: '42',
      eventId: envelope.eventId,
      type: 'TicketSold',
      correlationId: 'corr-1',
      publishedAt: '2026-10-13T15:00:00.000Z',
      deliveryAttempts: 5,
      payload: exampleTicketSold,
    });
  });

  it('keeps data that is not an event as text so it can still be discarded', () => {
    expect(toDeadLetter(pulled('not json'))).toEqual({
      messageId: '42',
      eventId: null,
      type: null,
      correlationId: null,
      publishedAt: '2026-10-13T15:00:00.000Z',
      deliveryAttempts: null,
      payload: 'not json',
    });
    expect(toDeadLetter(pulled('{"hello":1}')).payload).toBe('{"hello":1}');
  });
});
