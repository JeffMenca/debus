// Reads one message through the emulator's REST API and acknowledges it before returning.
// A streaming subscriber would keep gRPC calls (acks, nacks on close) running after the test
// file finishes, and those crash the Jest worker once the environment is torn down.
export interface PulledMessage {
  data: string;
  attributes: Record<string, string>;
}

interface PullResponse {
  receivedMessages?: {
    ackId: string;
    message: { data?: string; attributes?: Record<string, string> };
  }[];
}

function subscriptionUrl(subscription: string, action: 'pull' | 'acknowledge'): string {
  const host = process.env.PUBSUB_EMULATOR_HOST;
  const project = process.env.PUBSUB_PROJECT_ID;
  if (!host || !project) throw new Error('PUBSUB_EMULATOR_HOST and PUBSUB_PROJECT_ID are required');
  return `http://${host}/v1/projects/${project}/subscriptions/${subscription}:${action}`;
}

async function post(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

export async function pullOne(subscription: string, timeoutMs = 15_000): Promise<PulledMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pulled = (await post(subscriptionUrl(subscription, 'pull'), {
      maxMessages: 1,
    })) as PullResponse;
    const received = pulled.receivedMessages?.[0];
    if (received) {
      await post(subscriptionUrl(subscription, 'acknowledge'), { ackIds: [received.ackId] });
      return {
        data: Buffer.from(received.message.data ?? '', 'base64').toString(),
        attributes: received.message.attributes ?? {},
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No message arrived on ${subscription}`);
}
