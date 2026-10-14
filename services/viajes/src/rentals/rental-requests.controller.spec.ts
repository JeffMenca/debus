import { RentalRequestsController } from './rental-requests.controller';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const actor = {
  userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  role: 'BRANCH_ADMIN' as const,
  branchId,
};

describe('RentalRequestsController', () => {
  it('lists the requests of the branch of the session', async () => {
    const requests = { list: jest.fn().mockResolvedValue({ items: [] }) };
    const query = { status: 'PENDING' as const, page: 1, pageSize: 20 };
    const controller = new RentalRequestsController(requests as never);

    await controller.list(actor, query);

    expect(requests.list).toHaveBeenCalledWith(branchId, query);
    expect(() => controller.list({ ...actor, branchId: null }, query)).toThrow();
  });

  it('assigns a bus and a driver on behalf of the caller', async () => {
    const requests = { assign: jest.fn().mockResolvedValue({ id: 't' }) };
    const body = { busId: 'b', driverId: 'd', estimatedArrivalAt: 'x' };

    const result = await new RentalRequestsController(requests as never).assign(
      actor,
      'r',
      body,
      'c',
    );

    expect(result).toEqual({ id: 't' });
    expect(requests.assign).toHaveBeenCalledWith(actor, 'r', body, 'c');
  });
});
