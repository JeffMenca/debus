import { BadRequestException } from '@nestjs/common';
import { CounterController } from './counter.controller';

const actor = {
  userId: '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  role: 'CASHIER' as const,
  branchId: '9b2c7a10-1111-4c4c-8888-123456789abc',
};
const key = '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b';
const request = {
  tripId: '5b4a3f2e-1d0c-4b9a-8f7e-6d5c4b3a2f1e',
  seats: [9],
  paidOn: '2026-10-18',
  nit: 'CF',
};

function setup() {
  const trips = { list: jest.fn().mockResolvedValue('page') };
  const sales = { sell: jest.fn().mockResolvedValue('ticket') };
  return { trips, sales, controller: new CounterController(trips as never, sales as never) };
}

describe('CounterController', () => {
  it('lists only the trips leaving from the branch of whoever sells', async () => {
    const { trips, controller } = setup();
    const query = { page: 1, pageSize: 20 };

    expect(await controller.trips(actor, query)).toBe('page');
    expect(trips.list).toHaveBeenCalledWith(query, actor.branchId);
  });

  it('refuses to list for staff without a branch', () => {
    const { controller } = setup();

    expect(() =>
      controller.trips({ ...actor, branchId: null }, { page: 1, pageSize: 20 }),
    ).toThrow();
  });

  it('sells with the key of the request as the ticket id', async () => {
    const { sales, controller } = setup();

    expect(await controller.sell(actor, request, key, 'c-1')).toBe('ticket');
    expect(sales.sell).toHaveBeenCalledWith(actor, key, request, 'c-1');
  });

  it('refuses a sale without a valid key', () => {
    const { sales, controller } = setup();

    expect(() => controller.sell(actor, request, 'abc')).toThrow(BadRequestException);
    expect(sales.sell).not.toHaveBeenCalled();
  });
});
