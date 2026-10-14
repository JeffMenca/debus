import { type DeadLetter, type EventEnvelope, eventEnvelopeSchema } from '@debus/contracts';
import type { PulledMessage } from './dead-letter-queue';

// Pub/Sub adds this attribute when it forwards a message to the dead-letter topic.
const DELIVERY_COUNT = 'CloudPubSubDeadLetterSourceDeliveryCount';

export function parseEnvelope(data: Buffer): EventEnvelope | undefined {
  try {
    return eventEnvelopeSchema.safeParse(JSON.parse(data.toString('utf8'))).data;
  } catch {
    return undefined;
  }
}

export function toDeadLetter(message: PulledMessage): DeadLetter {
  const envelope = parseEnvelope(message.data);
  const attempts = Number(message.attributes[DELIVERY_COUNT]);
  return {
    messageId: message.messageId,
    eventId: envelope?.eventId ?? null,
    type: envelope?.type ?? null,
    correlationId: envelope?.correlationId ?? null,
    publishedAt: message.publishedAt.toISOString(),
    deliveryAttempts: Number.isInteger(attempts) && attempts > 0 ? attempts : null,
    payload: envelope ? envelope.payload : message.data.toString('utf8'),
  };
}
