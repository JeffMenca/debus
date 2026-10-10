import { randomUUID } from 'node:crypto';
import { type EventEnvelope, type EventType, topicName } from '@debus/contracts';
import { PubSub, type Message, type Subscription } from '@google-cloud/pubsub';

export interface EventCapture {
  next<T>(type: EventType, match: (payload: T) => boolean, timeoutMs?: number): Promise<T>;
  none<T>(type: EventType, match: (payload: T) => boolean, waitMs?: number): Promise<void>;
  /** Waits for late deliveries to settle and counts the matching events. */
  count<T>(type: EventType, match: (payload: T) => boolean, settleMs?: number): Promise<number>;
  close(): Promise<void>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Reads what administracion publishes through a throwaway pull subscription on the emulator.
export async function captureEvents(): Promise<EventCapture> {
  const pubsub = new PubSub({ projectId: process.env.PUBSUB_PROJECT_ID });
  const topic = pubsub.topic(topicName('administracion'));
  const received: EventEnvelope[] = [];
  let failure: Error | undefined;
  let subscription: Subscription;

  try {
    const [exists] = await topic.exists();
    if (!exists) await topic.create();
    [subscription] = await topic.createSubscription(`test-${randomUUID()}`);
  } catch (error) {
    await pubsub.close().catch(() => undefined);
    throw error;
  }
  // An emulator error must fail the test that is waiting, never crash or hang the runner.
  subscription.on('error', (error: Error) => {
    failure = error;
  });
  subscription.on('message', (message: Message) => {
    received.push(JSON.parse(message.data.toString()) as EventEnvelope);
    message.ack();
  });

  const matching = <T>(type: EventType, match: (payload: T) => boolean) =>
    received.filter((event) => event.type === type && match(event.payload as T));
  const assertHealthy = () => {
    if (failure) throw new Error(`The event subscription failed: ${failure.message}`);
  };

  return {
    async next(type, match, timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        assertHealthy();
        const found = matching(type, match)[0];
        if (found) return found.payload as never;
        await sleep(100);
      }
      assertHealthy();
      throw new Error(`No ${type} event arrived`);
    },
    async none(type, match, waitMs = 1_500) {
      await sleep(waitMs);
      assertHealthy();
      if (matching(type, match).length > 0) throw new Error(`Unexpected ${type} event`);
    },
    async count(type, match, settleMs = 1_500) {
      await sleep(settleMs);
      assertHealthy();
      return matching(type, match).length;
    },
    async close() {
      // Cleanup problems must not hide the result of the test that just ran.
      // Close first: it flushes the pending acknowledgements, which would fail once the subscription is gone.
      await subscription.close().catch(() => undefined);
      await subscription.delete().catch(() => undefined);
      await pubsub.close().catch(() => undefined);
    },
  };
}
