import { createEnvelope } from '@debus/contracts';
import { NotFoundException } from '@nestjs/common';
import { InMemoryInboxStore } from '../inbox/in-memory-inbox-store';
import type { InboxStore } from '../inbox/inbox-store';
import type { SqlClient } from '../inbox/sql-inbox-store';
import type { EventDispatcher } from './event-dispatcher';
import { pushBody } from '../testing/in-memory-event-bus';
import { InboundEvents } from './inbound-events';

function setup(handled = 1) {
  const dispatch = jest.fn().mockResolvedValue(handled);
  const events = new InboundEvents(new InMemoryInboxStore(), {
    dispatch,
  } as unknown as EventDispatcher);
  return { events, dispatch };
}

describe('InboundEvents', () => {
  it('dispatches a new event once even if Pub/Sub delivers it twice', async () => {
    const { events, dispatch } = setup();
    const envelope = createEnvelope('ProbeSent', {}, 'c');

    await expect(events.receive(pushBody(envelope))).resolves.toBe('processed');
    await expect(events.receive(pushBody(envelope))).resolves.toBe('duplicate');

    expect(dispatch).toHaveBeenCalledTimes(1);
    await expect(events.processed(envelope.eventId)).resolves.toMatchObject({
      type: 'ProbeSent',
    });
  });

  it('dispatches inside the inbox work with the transaction it provides', async () => {
    const tx = {} as SqlClient;
    const inbox: InboxStore = {
      runOnce: (_event, work) => work(tx).then(() => 'processed'),
      findProcessed: jest.fn(),
    };
    const dispatch = jest.fn().mockResolvedValue(1);
    const envelope = createEnvelope('ProbeSent', {}, 'c');

    await new InboundEvents(inbox, { dispatch } as unknown as EventDispatcher).receive(
      pushBody(envelope),
    );

    expect(dispatch).toHaveBeenCalledWith(envelope, tx);
  });

  it('still acknowledges events without handlers', async () => {
    const { events } = setup(0);

    await expect(events.receive(pushBody(createEnvelope('TicketSold', {}, 'c')))).resolves.toBe(
      'processed',
    );
  });

  it('answers 404 for unknown event ids', async () => {
    await expect(setup().events.processed('missing')).rejects.toThrow(NotFoundException);
  });
});
