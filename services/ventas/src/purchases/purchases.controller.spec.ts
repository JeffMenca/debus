import { MESSAGES } from '../messages';
import { PurchasesController } from './purchases.controller';

const actor = {
  userId: '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a',
  role: 'CLIENT' as const,
  branchId: null,
};
const key = '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b';
const request = {
  tripId: '5b4a3f2e-1d0c-4b9a-8f7e-6d5c4b3a2f1e',
  seats: [3, 4],
  paidOn: '2026-10-19',
};

function setup(status: 'CONFIRMED' | 'PENDING' = 'CONFIRMED') {
  const purchases = {
    purchase: jest.fn().mockResolvedValue({ ticketId: key, status }),
    get: jest.fn().mockResolvedValue({ ticketId: key, status }),
  };
  const response = { status: jest.fn() };
  return {
    purchases,
    response,
    controller: new PurchasesController(purchases as never),
  };
}

describe('PurchasesController', () => {
  it('buys with the key of the request as the ticket id, and passes the correlation id on', async () => {
    const { purchases, controller, response } = setup();

    const result = await controller.buy(actor, request, response as never, key, 'c-1');

    expect(result).toEqual({ ticketId: key, status: 'CONFIRMED' });
    expect(purchases.purchase).toHaveBeenCalledWith(actor, key, request, 'c-1');
  });

  it('answers 201 for a confirmed purchase and 202 for one still being confirmed', async () => {
    const confirmed = setup('CONFIRMED');
    await confirmed.controller.buy(actor, request, confirmed.response as never, key);
    const pending = setup('PENDING');
    await pending.controller.buy(actor, request, pending.response as never, key);

    expect(confirmed.response.status).toHaveBeenCalledWith(201);
    expect(pending.response.status).toHaveBeenCalledWith(202);
  });

  it('refuses a purchase without a valid key before doing anything', async () => {
    const { purchases, controller, response } = setup();

    for (const key of ['abc', undefined]) {
      await expect(controller.buy(actor, request, response as never, key)).rejects.toMatchObject({
        status: 400,
        message: MESSAGES.purchaseKeyMissing,
      });
    }
    expect(purchases.purchase).not.toHaveBeenCalled();
  });

  it('answers the purchase of the person who asks', async () => {
    const { purchases, controller } = setup();

    expect(await controller.get(actor, key)).toEqual({ ticketId: key, status: 'CONFIRMED' });
    expect(purchases.get).toHaveBeenCalledWith(actor, key);
  });
});
