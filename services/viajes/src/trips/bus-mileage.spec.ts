import { lastMileageKm } from './bus-mileage';

const dbWith = (endMileageKm: number | null) => ({
  tripArrival: { aggregate: jest.fn().mockResolvedValue({ _max: { endMileageKm } }) },
});

describe('lastMileageKm', () => {
  it('takes the copy of the bus when it has no completed trip', async () => {
    const db = dbWith(null);

    await expect(lastMileageKm(db as never, 'bus', 1000)).resolves.toBe(1000);
    expect(db.tripArrival.aggregate).toHaveBeenCalledWith({
      _max: { endMileageKm: true },
      where: { trip: { busId: 'bus' } },
    });
  });

  it('takes the last arrival when the copy has not heard of it yet', async () => {
    await expect(lastMileageKm(dbWith(1204) as never, 'bus', 1000)).resolves.toBe(1204);
  });

  it('takes the copy when a later edit of the bus raised it above the last arrival', async () => {
    await expect(lastMileageKm(dbWith(1204) as never, 'bus', 1500)).resolves.toBe(1500);
  });
});
