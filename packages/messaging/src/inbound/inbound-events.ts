import type { EventEnvelope } from '@debus/contracts';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { InboxOutcome, InboxStore, ProcessedEvent } from '../inbox/inbox-store';
import { INBOX_STORE } from '../tokens';
import { EventDispatcher } from './event-dispatcher';
import { decodePushMessage } from './push-message';

@Injectable()
export class InboundEvents {
  private readonly logger = new Logger(InboundEvents.name);

  constructor(
    @Inject(INBOX_STORE) private readonly inbox: InboxStore,
    private readonly dispatcher: EventDispatcher,
  ) {}

  receive(body: unknown): Promise<InboxOutcome> {
    return this.handle(decodePushMessage(body));
  }

  // Runs an event through the inbox and its handlers once, however many times it arrives.
  async handle(envelope: EventEnvelope): Promise<InboxOutcome> {
    const outcome = await this.inbox.runOnce(envelope, async (tx) => {
      const handled = await this.dispatcher.dispatch(envelope, tx);
      if (handled === 0) this.logger.warn(`No handler for ${envelope.type}`);
    });
    this.logger.log(`${envelope.type} ${envelope.eventId} ${outcome}`);
    return outcome;
  }

  async processed(eventId: string): Promise<ProcessedEvent> {
    const found = await this.inbox.findProcessed(eventId);
    if (!found) throw new NotFoundException();
    return found;
  }
}
