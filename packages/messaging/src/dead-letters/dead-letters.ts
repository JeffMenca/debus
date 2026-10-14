import type { DeadLetterList, ReplayResult } from '@debus/contracts';
import { SERVER_MESSAGES } from '@debus/server';
import { BadGatewayException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InboundEvents } from '../inbound/inbound-events';
import { DeadLetterQueue, type PulledMessage } from './dead-letter-queue';
import { DEAD_LETTER_MESSAGES } from './messages';
import { parseEnvelope, toDeadLetter } from './to-dead-letter';

// Pub/Sub returns at most this many messages per pull; a dead-letter queue is expected to be small.
const SEARCH_WINDOW = 100;

/**
 * Lets the system admin review the events this service could not process. A replay runs the event
 * through this service's own inbox and handlers, so other consumers never receive it twice.
 */
@Injectable()
export class DeadLetters {
  private readonly logger = new Logger(DeadLetters.name);

  constructor(
    private readonly queue: DeadLetterQueue,
    private readonly inbound: InboundEvents,
  ) {}

  async list(limit: number): Promise<DeadLetterList> {
    const messages = await this.queue.pull(limit + 1);
    await this.queue.release(messages.map((message) => message.ackId));
    return {
      items: messages.slice(0, limit).map(toDeadLetter),
      hasMore: messages.length > limit,
    };
  }

  async replay(messageId: string): Promise<ReplayResult> {
    return this.withMessage(messageId, async (message) => {
      try {
        const envelope = parseEnvelope(message.data);
        if (!envelope) throw new Error('the message is not an event envelope');
        return { outcome: await this.inbound.handle(envelope) };
      } catch (error) {
        this.logger.warn(`Dead-letter ${messageId} failed again: ${String(error)}`);
        throw new BadGatewayException(DEAD_LETTER_MESSAGES.replayFailed);
      }
    });
  }

  async discard(messageId: string): Promise<void> {
    await this.withMessage(messageId, async () => {
      this.logger.log(`Dead-letter ${messageId} discarded`);
    });
  }

  // Every other message goes back at once; the target is acknowledged only when the work succeeds.
  private async withMessage<T>(
    messageId: string,
    work: (message: PulledMessage) => Promise<T>,
  ): Promise<T> {
    const messages = await this.queue.pull(SEARCH_WINDOW);
    const target = messages.find((message) => message.messageId === messageId);
    await this.queue.release(
      messages.filter((message) => message !== target).map((message) => message.ackId),
    );
    if (!target) throw new NotFoundException(SERVER_MESSAGES.notFound);
    try {
      const result = await work(target);
      await this.queue.ack([target.ackId]);
      return result;
    } catch (error) {
      await this.queue.release([target.ackId]);
      throw error;
    }
  }
}
