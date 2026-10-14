import {
  createEnvelope,
  exampleTripCompleted,
  exampleTripDeleted,
  exampleTripDeparted,
  exampleTripScheduled,
} from '@debus/contracts';
import { TripFactsHandler } from './trip-facts.handler';

const setup = () => {
  const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1), $queryRawUnsafe: jest.fn() };
  const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
  return { tx, prisma, handler: new TripFactsHandler(prisma as never) };
};
const envelope = createEnvelope('TripScheduled', {}, 'c');
const sqlOf = (tx: { $executeRawUnsafe: jest.Mock }) =>
  String(tx.$executeRawUnsafe.mock.calls[0]?.[0]);
const valuesOf = (tx: { $executeRawUnsafe: jest.Mock }) =>
  tx.$executeRawUnsafe.mock.calls[0]?.slice(1);

describe('TripFactsHandler', () => {
  it('records what is known when a trip is scheduled', async () => {
    const { tx, handler } = setup();
    const trip = exampleTripScheduled;

    await handler.tripScheduled(trip, envelope, tx);

    expect(sqlOf(tx)).toContain('INSERT INTO branch_report_trips');
    expect(sqlOf(tx)).toContain('ON CONFLICT (id) DO UPDATE');
    expect(sqlOf(tx)).not.toContain('deleted_at');
    expect(valuesOf(tx)).toEqual([
      trip.tripId,
      trip.branchId,
      trip.busId,
      trip.driverId,
      'REGULAR',
      trip.routeId,
      null,
      'C482BTX',
      'Quetzaltenango',
      'Guatemala',
      trip.departureAt,
    ]);
  });

  it('records the departure without touching what the schedule wrote', async () => {
    const { tx, handler } = setup();
    const trip = exampleTripDeparted;

    await handler.tripDeparted(trip, envelope, tx);

    expect(sqlOf(tx)).toContain('SET departed_at = EXCLUDED.departed_at');
    expect(sqlOf(tx)).not.toContain('bus_plate');
    expect(valuesOf(tx)).toEqual([
      trip.tripId,
      trip.branchId,
      trip.busId,
      trip.driverId,
      trip.departedAt,
      trip.startMileageKm,
    ]);
  });

  it('records the arrival with the amounts fixed when the trip completed', async () => {
    const { tx, handler } = setup();
    const trip = exampleTripCompleted;

    await handler.tripCompleted(trip, envelope, tx);

    expect(sqlOf(tx)).toContain('arrived_at = EXCLUDED.arrived_at');
    expect(valuesOf(tx)).toEqual([
      trip.tripId,
      trip.branchId,
      trip.busId,
      trip.driverId,
      'REGULAR',
      trip.routeId,
      trip.departedAt,
      trip.arrivedAt,
      148410,
      148612,
      1250,
      1.5,
      303,
    ]);
  });

  it('leaves a tombstone for a deleted trip', async () => {
    const { tx, handler } = setup();
    const trip = exampleTripDeleted;

    await handler.tripDeleted(trip, envelope, tx);

    expect(sqlOf(tx)).toContain('COALESCE(branch_report_trips.deleted_at, now())');
    expect(valuesOf(tx)).toEqual([
      trip.tripId,
      trip.branchId,
      trip.busId,
      trip.driverId,
      'REGULAR',
      trip.departureAt,
    ]);
  });

  it.each(['tripScheduled', 'tripDeparted', 'tripCompleted', 'tripDeleted'] as const)(
    'rejects a malformed payload on %s without writing',
    async (method) => {
      const { tx, handler } = setup();

      await expect(handler[method]({ tripId: 'x' }, envelope, tx)).rejects.toThrow();
      expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['tripScheduled', exampleTripScheduled],
    ['tripDeparted', exampleTripDeparted],
    ['tripCompleted', exampleTripCompleted],
    ['tripDeleted', exampleTripDeleted],
  ] as const)(
    'falls back to the service client on %s outside the inbox',
    async (method, payload) => {
      const { prisma, handler } = setup();

      await handler[method](payload, envelope);

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    },
  );
});
