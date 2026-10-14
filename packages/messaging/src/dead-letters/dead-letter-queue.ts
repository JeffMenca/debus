import type { protos, v1 } from '@google-cloud/pubsub';
import { type OnApplicationShutdown, ServiceUnavailableException } from '@nestjs/common';
import { DEAD_LETTER_MESSAGES } from './messages';

export interface PulledMessage {
  ackId: string;
  messageId: string;
  data: Buffer;
  attributes: Record<string, string>;
  publishedAt: Date;
}

export type SubscriberApi = Pick<
  v1.SubscriberClient,
  'pull' | 'acknowledge' | 'modifyAckDeadline' | 'close'
>;

// gRPC status codes.
const DEADLINE_EXCEEDED = 4;
const NOT_FOUND = 5;
const PERMISSION_DENIED = 7;
// A synchronous pull waits for messages until its deadline, so an empty queue costs this much.
const PULL_TIMEOUT_MS = 3000;

const codeOf = (error: unknown): unknown => (error as { code?: unknown } | null)?.code;

function toPulled({ ackId, message }: protos.google.pubsub.v1.IReceivedMessage): PulledMessage {
  const seconds = Number(message?.publishTime?.seconds ?? 0);
  const nanos = message?.publishTime?.nanos ?? 0;
  return {
    ackId: ackId ?? '',
    messageId: message?.messageId ?? '',
    data: Buffer.from(message?.data ?? ''),
    attributes: { ...message?.attributes },
    publishedAt: new Date(seconds * 1000 + Math.floor(nanos / 1e6)),
  };
}

// The <service>-dlq-sub pull subscription. The emulator has no dead-letters, so there a missing
// subscription reads as empty; in the cloud it means provisioning did not run and must surface.
export class DeadLetterQueue implements OnApplicationShutdown {
  constructor(
    private readonly client: SubscriberApi,
    private readonly subscription: string,
    private readonly missingIsEmpty: boolean,
  ) {}

  async pull(maxMessages: number): Promise<PulledMessage[]> {
    try {
      const [response] = await this.client.pull(
        { subscription: this.subscription, maxMessages },
        { timeout: PULL_TIMEOUT_MS },
      );
      return (response.receivedMessages ?? []).map(toPulled);
    } catch (error) {
      const code = codeOf(error);
      if (code === DEADLINE_EXCEEDED || (code === NOT_FOUND && this.missingIsEmpty)) return [];
      if (code === PERMISSION_DENIED) {
        throw new ServiceUnavailableException(DEAD_LETTER_MESSAGES.unreadable);
      }
      throw error;
    }
  }

  async ack(ackIds: string[]): Promise<void> {
    if (ackIds.length === 0) return;
    await this.client.acknowledge({ subscription: this.subscription, ackIds });
  }

  // A zero deadline hands the messages back to the subscription right away.
  async release(ackIds: string[]): Promise<void> {
    if (ackIds.length === 0) return;
    await this.client.modifyAckDeadline({
      subscription: this.subscription,
      ackIds,
      ackDeadlineSeconds: 0,
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}
