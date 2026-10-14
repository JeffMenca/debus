import { queueTripsOf } from './trip-locks';

describe('queueTripsOf', () => {
  it('queues for the bus first and then for the driver, inside the transaction', async () => {
    const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(0) };

    await queueTripsOf(tx as never, 'bus-1', 'driver-1');

    expect(tx.$executeRawUnsafe.mock.calls).toEqual([
      ['SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', 'trip-bus:bus-1'],
      ['SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', 'trip-driver:driver-1'],
    ]);
  });
});
