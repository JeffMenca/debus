import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { InboxStore, ProcessedEvent } from '../inbox/inbox-store';
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

  async receive(body: unknown): Promise<void> {
    const envelope = decodePushMessage(body);
    const outcome = await this.inbox.runOnce(envelope, async (tx) => {
      const handled = await this.dispatcher.dispatch(envelope, tx);
      if (handled === 0) this.logger.warn(`No handler for ${envelope.type}`);
    });
    this.logger.log(`${envelope.type} ${envelope.eventId} ${outcome}`);
  }

  async processed(eventId: string): Promise<ProcessedEvent> {
    const found = await this.inbox.findProcessed(eventId);
    if (!found) throw new NotFoundException();
    return found;
  }
}
