import { type EventType, createEnvelope, publisherOf, topicName } from '@debus/contracts';

const EMULATOR = process.env.PUBSUB_EMULATOR_HOST ?? 'localhost:8085';
const PROJECT = process.env.PUBSUB_PROJECT_ID ?? 'debus-local';

// Publishes an event of a service the spec does not drive (ventas, clientes) to the local emulator,
// the way that service would: the same topic, envelope and attributes. Local stack only.
export async function publishLocalEvent(type: EventType, payload: unknown): Promise<void> {
  const envelope = createEnvelope(type, payload, 'e2e');
  const url = `http://${EMULATOR}/v1/projects/${PROJECT}/topics/${topicName(publisherOf(type))}:publish`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [
        {
          data: Buffer.from(JSON.stringify(envelope)).toString('base64'),
          attributes: {
            type,
            eventId: envelope.eventId,
            correlationId: envelope.correlationId,
          },
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`The emulator refused ${type}: ${response.status} ${await response.text()}`);
  }
}
