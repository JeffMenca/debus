import { createEnvelope, exampleTripScheduled } from '@debus/contracts';
import { TripsHandler } from './trips.handler';

const envelope = createEnvelope('TripScheduled', exampleTripScheduled, 'c');
const sqlClient = () => ({
  $executeRawUnsafe: jest.fn().mockResolvedValue(1),
  $queryRawUnsafe: jest.fn(),
});

describe('TripsHandler', () => {
  it('copies a regular trip once, even if the event comes back', async () => {
    const tx = sqlClient();

    await new TripsHandler({} as never).scheduled(exampleTripScheduled, envelope, tx);

    const [[sql, ...values]] = tx.$executeRawUnsafe.mock.calls;
    expect(sql).toContain('ON CONFLICT (trip_id) DO NOTHING');
    expect(values).toEqual([
      exampleTripScheduled.tripId,
      exampleTripScheduled.branchId,
      exampleTripScheduled.routeId,
      exampleTripScheduled.busId,
      'C482BTX',
      'Quetzaltenango',
      'Guatemala',
      40,
      85,
      exampleTripScheduled.departureAt,
      exampleTripScheduled.estimatedArrivalAt,
      'quetzaltenango guatemala c482btx',
    ]);
  });

  it('uses the service client when the inbox gives no transaction', async () => {
    const prisma = sqlClient();

    await new TripsHandler(prisma as never).scheduled(exampleTripScheduled, envelope);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('ignores a rental trip, which sells no seats', async () => {
    const tx = sqlClient();
    const rental = {
      ...exampleTripScheduled,
      type: 'RENTAL',
      routeId: null,
      ticketPrice: null,
      rentalId: exampleTripScheduled.tripId,
    };

    await new TripsHandler({} as never).scheduled(rental, envelope, tx);

    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('rejects a payload that breaks the contract', async () => {
    const tx = sqlClient();

    await expect(
      new TripsHandler({} as never).scheduled({ tripId: 'x' }, envelope, tx),
    ).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
