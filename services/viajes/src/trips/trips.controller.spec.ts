import { TripsController } from './trips.controller';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const actor = {
  userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  role: 'BRANCH_ADMIN' as const,
  branchId,
};

describe('TripsController', () => {
  it('schedules a trip on behalf of the caller', async () => {
    const trips = { schedule: jest.fn().mockResolvedValue({ id: 't' }) };
    const body = { routeId: 'r' } as never;

    const result = await new TripsController(trips as never).schedule(actor, body, 'c');

    expect(result).toEqual({ id: 't' });
    expect(trips.schedule).toHaveBeenCalledWith(actor, body, 'c');
  });

  it('lists and shows the trips of the branch of the session', async () => {
    const trips = {
      list: jest.fn().mockResolvedValue({ items: [] }),
      get: jest.fn().mockResolvedValue({ id: 't' }),
    };
    const controller = new TripsController(trips as never);
    const query = { status: 'all' as const, page: 1, pageSize: 20 };

    await controller.list(actor, query);
    await controller.get(actor, 't');

    expect(trips.list).toHaveBeenCalledWith(branchId, query);
    expect(trips.get).toHaveBeenCalledWith(branchId, 't');
    expect(() => controller.list({ ...actor, branchId: null }, query)).toThrow();
  });
});
