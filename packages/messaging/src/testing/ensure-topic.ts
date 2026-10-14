import { type BackendService, topicName } from '@debus/contracts';
import { PubSub } from '@google-cloud/pubsub';

const ALREADY_EXISTS = 6;

// The tests publish to a Pub/Sub project of their own, which has no topics until something creates
// them. Without the topic every publication fails and the events stay pending in the outbox.
export async function ensureTopic(service: BackendService): Promise<void> {
  const pubsub = new PubSub({ projectId: process.env.PUBSUB_PROJECT_ID });
  try {
    await pubsub.createTopic(topicName(service));
  } catch (error) {
    if ((error as { code?: number }).code !== ALREADY_EXISTS) throw error;
  } finally {
    await pubsub.close();
  }
}
