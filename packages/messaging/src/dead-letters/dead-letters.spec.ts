import { createEnvelope, exampleTicketSold } from '@debus/contracts';
import { BadGatewayException, NotFoundException } from '@nestjs/common';
import type { InboundEvents } from '../inbound/inbound-events';
import type { DeadLetterQueue, PulledMessage } from './dead-letter-queue';
import { DeadLetters } from './dead-letters';

const envelope = createEnvelope('TicketSold', exampleTicketSold, 'c');
const message = (id: string, data = JSON.stringify(envelope)): PulledMessage => ({
  ackId: `ack-${id}`,
  messageId: id,
  data: Buffer.from(data),
  attributes: {},
  publishedAt: new Date('2026-10-13T15:00:00.000Z'),
});

function setup(messages: PulledMessage[], handle = jest.fn().mockResolvedValue('processed')) {
  const queue = {
    pull: jest.fn().mockResolvedValue(messages),
    ack: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };
  const deadLetters = new DeadLetters(
    queue as unknown as DeadLetterQueue,
    { handle } as unknown as InboundEvents,
  );
  return { queue, handle, deadLetters };
}

describe('DeadLetters', () => {
  it('lists the oldest messages and gives every one of them back to the queue', async () => {
    const { queue, deadLetters } = setup([message('1'), message('2'), message('3')]);

    const list = await deadLetters.list(2);

    expect(queue.pull).toHaveBeenCalledWith(3);
    expect(list.hasMore).toBe(true);
    expect(list.items.map((item) => item.messageId)).toEqual(['1', '2']);
    expect(list.items[0]).toMatchObject({ type: 'TicketSold', eventId: envelope.eventId });
    expect(queue.release).toHaveBeenCalledWith(['ack-1', 'ack-2', 'ack-3']);
  });

  it('says there is nothing more when the queue had at most the limit', async () => {
    const { deadLetters } = setup([message('1')]);
    await expect(deadLetters.list(20)).resolves.toMatchObject({ hasMore: false });
  });

  it('replays a message through the inbox and removes it when it succeeds', async () => {
    const { queue, handle, deadLetters } = setup([message('1'), message('2')]);

    await expect(deadLetters.replay('2')).resolves.toEqual({ outcome: 'processed' });

    expect(handle).toHaveBeenCalledWith(envelope);
    expect(queue.ack).toHaveBeenCalledWith(['ack-2']);
    expect(queue.release).toHaveBeenCalledWith(['ack-1']);
  });

  it('removes a replayed event the service had already processed', async () => {
    const { queue, deadLetters } = setup([message('1')], jest.fn().mockResolvedValue('duplicate'));

    await expect(deadLetters.replay('1')).resolves.toEqual({ outcome: 'duplicate' });
    expect(queue.ack).toHaveBeenCalledWith(['ack-1']);
  });

  it('keeps the message when the replay fails again', async () => {
    const { queue, deadLetters } = setup(
      [message('1'), message('2')],
      jest.fn().mockRejectedValue(new Error('database is down')),
    );

    await expect(deadLetters.replay('1')).rejects.toThrow(BadGatewayException);
    expect(queue.ack).not.toHaveBeenCalled();
    expect(queue.release).toHaveBeenNthCalledWith(1, ['ack-2']);
    expect(queue.release).toHaveBeenNthCalledWith(2, ['ack-1']);
  });

  it('cannot replay a message that is not an event, which stays to be discarded', async () => {
    const { queue, handle, deadLetters } = setup([message('1', 'not json')]);

    await expect(deadLetters.replay('1')).rejects.toThrow(BadGatewayException);
    expect(handle).not.toHaveBeenCalled();
    expect(queue.release).toHaveBeenLastCalledWith(['ack-1']);
  });

  it('discards a message without processing it', async () => {
    const { queue, handle, deadLetters } = setup([message('1', 'not json'), message('2')]);

    await deadLetters.discard('1');

    expect(handle).not.toHaveBeenCalled();
    expect(queue.ack).toHaveBeenCalledWith(['ack-1']);
    expect(queue.release).toHaveBeenCalledWith(['ack-2']);
  });

  it('answers 404 for a message that is no longer in the queue', async () => {
    const { queue, deadLetters } = setup([message('1')]);

    await expect(deadLetters.replay('9')).rejects.toThrow(NotFoundException);
    await expect(deadLetters.discard('9')).rejects.toThrow(NotFoundException);
    expect(queue.pull).toHaveBeenCalledWith(100);
    expect(queue.release).toHaveBeenCalledWith(['ack-1']);
  });
});
