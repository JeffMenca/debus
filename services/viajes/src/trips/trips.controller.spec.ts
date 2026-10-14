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

    const result = await new TripsController(trips as never, {} as never).schedule(
      actor,
      body,
      'c',
    );

    expect(result).toEqual({ id: 't' });
    expect(trips.schedule).toHaveBeenCalledWith(actor, body, 'c');
  });

  it('lists and shows the trips for the caller, whose role decides the scope', async () => {
    const trips = {
      list: jest.fn().mockResolvedValue({ items: [] }),
      get: jest.fn().mockResolvedValue({ id: 't' }),
    };
    const controller = new TripsController(trips as never, {} as never);
    const query = { status: 'all' as const, page: 1, pageSize: 20 };

    await controller.list(actor, query);
    await controller.get(actor, 't');

    expect(trips.list).toHaveBeenCalledWith(actor, query);
    expect(trips.get).toHaveBeenCalledWith(actor, 't');
  });

  it('records the departure and the arrival on behalf of the caller', async () => {
    const cycle = {
      recordDeparture: jest.fn().mockResolvedValue({ id: 't' }),
      recordArrival: jest.fn().mockResolvedValue({ id: 't' }),
    };
    const controller = new TripsController({} as never, cycle as never);
    const departure = { departedAt: 'x', startMileageKm: 1 };
    const arrival = { arrivedAt: 'x', endMileageKm: 2, fuelCost: 3 };

    await controller.recordDeparture(actor, 't', departure, 'c');
    await controller.recordArrival(actor, 't', arrival, 'c');

    expect(cycle.recordDeparture).toHaveBeenCalledWith(actor, 't', departure, 'c');
    expect(cycle.recordArrival).toHaveBeenCalledWith(actor, 't', arrival, 'c');
  });

  it('deletes a trip on behalf of the caller and answers nothing', async () => {
    const cycle = { remove: jest.fn().mockResolvedValue(undefined) };

    const result = await new TripsController({} as never, cycle as never).remove(actor, 't', 'c');

    expect(result).toBeUndefined();
    expect(cycle.remove).toHaveBeenCalledWith(actor, 't', 'c');
  });
});
