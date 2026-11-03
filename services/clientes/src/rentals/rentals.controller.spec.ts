import { BranchRentalsController } from './branch-rentals.controller';
import { RentalsController } from './rentals.controller';

const client = {
  userId: '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a',
  role: 'CLIENT' as const,
  branchId: null,
};
const admin = { ...client, role: 'BRANCH_ADMIN' as const, branchId: 'b' };
const RENTAL = '6e5d4c3b-2a19-4f8e-9d7c-6b5a4f3e2d1c';
const query = { status: 'all' as const, page: 1, pageSize: 20 };

function rentals() {
  const answer = jest.fn().mockResolvedValue({ id: 'r' });
  return {
    estimate: answer,
    request: answer,
    history: answer,
    pay: answer,
    cancel: answer,
    branchList: answer,
    registerCounter: answer,
    confirm: answer,
  };
}

describe('RentalsController', () => {
  it('hands every request to the service on behalf of the caller', async () => {
    const service = rentals();
    const controller = new RentalsController(service as never);
    const trip = { distanceKm: 92 } as never;

    await controller.estimate({ distanceKm: 92 });
    expect(service.estimate).toHaveBeenLastCalledWith(92);
    await controller.request(client, trip);
    expect(service.request).toHaveBeenLastCalledWith(client, trip);
    await controller.history(client, query);
    expect(service.history).toHaveBeenLastCalledWith(client, query);
    await controller.pay(client, RENTAL, { paidOn: '2026-10-21' }, RENTAL, 'c');
    expect(service.pay).toHaveBeenLastCalledWith(
      client,
      RENTAL,
      RENTAL,
      { paidOn: '2026-10-21' },
      'c',
    );
    await controller.cancel(client, 'r');
    expect(service.cancel).toHaveBeenLastCalledWith(client, 'r');
  });

  it('asks for the key of a payment', () => {
    const controller = new RentalsController(rentals() as never);

    expect(() => controller.pay(client, 'r', { paidOn: '2026-10-21' })).toThrow();
  });
});

describe('BranchRentalsController', () => {
  it('lists, registers at the counter and confirms for the branch admin', async () => {
    const service = rentals();
    const controller = new BranchRentalsController(service as never);
    const counter = { price: 2500 } as never;

    await controller.list(admin, query);
    expect(service.branchList).toHaveBeenLastCalledWith(admin, query);
    await controller.registerCounter(admin, counter, 'c-1');
    expect(service.registerCounter).toHaveBeenLastCalledWith(admin, counter, 'c-1');
    await controller.confirm(admin, 'r', { price: 2500 }, 'c');
    expect(service.confirm).toHaveBeenLastCalledWith(admin, 'r', { price: 2500 }, 'c');
  });
});
