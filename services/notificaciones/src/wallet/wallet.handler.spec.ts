import { createEnvelope, exampleWalletCredited } from '@debus/contracts';
import { WalletHandler } from './wallet.handler';

describe('WalletHandler', () => {
  it('queues one email per credited movement', async () => {
    const queue = { enqueue: jest.fn().mockResolvedValue(1) };
    const envelope = createEnvelope('WalletCredited', exampleWalletCredited, 'c');
    const tx = {};

    await new WalletHandler(queue as never).credited(exampleWalletCredited, envelope, tx as never);

    expect(queue.enqueue).toHaveBeenCalledWith(tx, [
      expect.objectContaining({
        eventId: envelope.eventId,
        dedupeKey: `wallet-credited:${exampleWalletCredited.movementId}`,
        template: 'WALLET_TOP_UP',
      }),
    ]);
  });

  it('names a refund with its own template and rejects an invalid payload', async () => {
    const queue = { enqueue: jest.fn().mockResolvedValue(1) };
    const handler = new WalletHandler(queue as never);
    const refund = { ...exampleWalletCredited, kind: 'REFUND' };

    await handler.credited(refund, createEnvelope('WalletCredited', refund, 'c'));
    await expect(handler.credited({}, createEnvelope('WalletCredited', {}, 'c'))).rejects.toThrow();

    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(queue.enqueue.mock.calls[0][1][0].template).toBe('WALLET_REFUND');
  });
});
