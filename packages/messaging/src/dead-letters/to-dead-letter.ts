import { type DeadLetter, eventEnvelopeSchema } from '@debus/contracts';
import type { PulledMessage } from './dead-letter-queue';

// Pub/Sub adds this attribute when it forwards a message to the dead-letter topic.
const DELIVERY_COUNT = 'CloudPubSubDeadLetterSourceDeliveryCount';

function parseEnvelope(text: string) {
  try {
    return eventEnvelopeSchema.safeParse(JSON.parse(text)).data;
  } catch {
    return undefined;
  }
}

export function toDeadLetter(message: PulledMessage): DeadLetter {
  const text = message.data.toString('utf8');
  const envelope = parseEnvelope(text);
  const attempts = Number(message.attributes[DELIVERY_COUNT]);
  return {
    messageId: message.messageId,
    eventId: envelope?.eventId ?? null,
    type: envelope?.type ?? null,
    correlationId: envelope?.correlationId ?? null,
    publishedAt: message.publishedAt.toISOString(),
    deliveryAttempts: Number.isInteger(attempts) && attempts > 0 ? attempts : null,
    payload: envelope ? envelope.payload : text,
  };
}
