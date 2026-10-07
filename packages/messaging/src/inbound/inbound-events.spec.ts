import { createEnvelope } from '@debus/contracts';
import { NotFoundException } from '@nestjs/common';
import { InMemoryInboxStore } from '../inbox/in-memory-inbox-store';
import type { EventDispatcher } from './event-dispatcher';
import { InboundEvents } from './inbound-events';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64') },
});

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
    const envelope = createEnvelope('SondeoEmitido', {}, 'c');

    await events.receive(push(envelope));
    await events.receive(push(envelope));

    expect(dispatch).toHaveBeenCalledTimes(1);
    await expect(events.processed(envelope.eventId)).resolves.toMatchObject({
      type: 'SondeoEmitido',
    });
  });

  it('still acknowledges events without handlers', async () => {
    const { events } = setup(0);

    await expect(
      events.receive(push(createEnvelope('BoletoVendido', {}, 'c'))),
    ).resolves.toBeUndefined();
  });

  it('answers 404 for unknown event ids', async () => {
    await expect(setup().events.processed('missing')).rejects.toThrow(NotFoundException);
  });
});
