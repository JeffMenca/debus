import { type EventEnvelope, publisherOf, topicName } from '@debus/contracts';
import type { PubSub } from '@google-cloud/pubsub';
import { Inject, Injectable } from '@nestjs/common';
import type { MessagingSettings } from '../settings';
import { MESSAGING_SETTINGS, PUBSUB_CLIENT } from '../tokens';

@Injectable()
export class EventPublisher {
  constructor(
    @Inject(PUBSUB_CLIENT) private readonly pubsub: PubSub,
    @Inject(MESSAGING_SETTINGS) private readonly settings: MessagingSettings,
  ) {}

  async publish(envelope: EventEnvelope): Promise<string> {
    const producer = publisherOf(envelope.type);
    if (producer !== this.settings.service) {
      throw new Error(`${this.settings.service} cannot publish ${envelope.type}`);
    }
    return this.pubsub.topic(topicName(producer, this.settings.environment)).publishMessage({
      json: envelope,
      attributes: {
        type: envelope.type,
        eventId: envelope.eventId,
        correlationId: envelope.correlationId,
      },
    });
  }
}
