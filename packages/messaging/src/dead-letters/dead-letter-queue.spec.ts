import { ServiceUnavailableException } from '@nestjs/common';
import { DeadLetterQueue, type SubscriberApi } from './dead-letter-queue';

const SUBSCRIPTION = 'projects/p/subscriptions/clientes-dlq-sub';
const grpcError = (code: number) => Object.assign(new Error(`code ${code}`), { code });

function setup(pull: jest.Mock = jest.fn()) {
  const client = {
    pull,
    acknowledge: jest.fn().mockResolvedValue([{}]),
    modifyAckDeadline: jest.fn().mockResolvedValue([{}]),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return { client, queue: new DeadLetterQueue(client as unknown as SubscriberApi, SUBSCRIPTION) };
}

describe('DeadLetterQueue', () => {
  it('pulls messages with their data, attributes and publish time', async () => {
    const { client, queue } = setup(
      jest.fn().mockResolvedValue([
        {
          receivedMessages: [
            {
              ackId: 'a1',
              message: {
                messageId: '42',
                data: Buffer.from('{}'),
                attributes: { type: 'TicketSold' },
                publishTime: { seconds: 1_760_367_600, nanos: 500_000_000 },
              },
            },
            { ackId: 'a2', message: { messageId: '43' } },
          ],
        },
      ]),
    );

    const messages = await queue.pull(10);

    expect(client.pull).toHaveBeenCalledWith(
      { subscription: SUBSCRIPTION, maxMessages: 10 },
      { timeout: 3000 },
    );
    expect(messages).toEqual([
      {
        ackId: 'a1',
        messageId: '42',
        data: Buffer.from('{}'),
        attributes: { type: 'TicketSold' },
        publishedAt: new Date(1_760_367_600_500),
      },
      {
        ackId: 'a2',
        messageId: '43',
        data: Buffer.alloc(0),
        attributes: {},
        publishedAt: new Date(0),
      },
    ]);
  });

  it('reads an empty queue when nothing arrives, or when it does not exist (local)', async () => {
    await expect(setup(jest.fn().mockResolvedValue([{}])).queue.pull(5)).resolves.toEqual([]);
    await expect(setup(jest.fn().mockRejectedValue(grpcError(4))).queue.pull(5)).resolves.toEqual(
      [],
    );
    await expect(setup(jest.fn().mockRejectedValue(grpcError(5))).queue.pull(5)).resolves.toEqual(
      [],
    );
  });

  it('answers 503 when the service may not read its queue, and rethrows anything else', async () => {
    await expect(setup(jest.fn().mockRejectedValue(grpcError(7))).queue.pull(5)).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(setup(jest.fn().mockRejectedValue(grpcError(13))).queue.pull(5)).rejects.toThrow(
      'code 13',
    );
  });

  it('acknowledges to remove and releases at once to keep the message', async () => {
    const { client, queue } = setup();

    await queue.ack(['a1']);
    await queue.release(['a2', 'a3']);
    await queue.ack([]);
    await queue.release([]);

    expect(client.acknowledge).toHaveBeenCalledTimes(1);
    expect(client.acknowledge).toHaveBeenCalledWith({ subscription: SUBSCRIPTION, ackIds: ['a1'] });
    expect(client.modifyAckDeadline).toHaveBeenCalledTimes(1);
    expect(client.modifyAckDeadline).toHaveBeenCalledWith({
      subscription: SUBSCRIPTION,
      ackIds: ['a2', 'a3'],
      ackDeadlineSeconds: 0,
    });
  });

  it('closes its client when the application stops', async () => {
    const { client, queue } = setup();
    await queue.onApplicationShutdown();
    expect(client.close).toHaveBeenCalled();
  });
});
