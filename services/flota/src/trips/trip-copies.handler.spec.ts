import {
  createEnvelope,
  exampleTripCompleted,
  exampleTripDeleted,
  exampleTripDeparted,
  exampleTripScheduled,
} from '@debus/contracts';
import { TripCopiesHandler } from './trip-copies.handler';

type Row = { status: string };

// The SQL text tells the statements apart: a lock on the trip copy, the check that the bus is ours.
const setup = (over: { current?: string | null; ownsBus?: boolean } = {}) => {
  const { current = null, ownsBus = true } = over;
  const tx = {
    $queryRawUnsafe: jest.fn((sql: string): Promise<Row[] | unknown[]> => {
      if (sql.includes('FROM trip_copies'))
        return Promise.resolve(current ? [{ status: current }] : []);
      return Promise.resolve(ownsBus ? [{ '?column?': 1 }] : []);
    }),
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
  };
  const prisma = { $queryRawUnsafe: jest.fn(), $executeRawUnsafe: jest.fn() };
  return { tx, prisma, handler: new TripCopiesHandler(prisma as never) };
};
const statements = (tx: { $executeRawUnsafe: jest.Mock }) =>
  tx.$executeRawUnsafe.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, ' ').trim());
const env = (type: 'TripScheduled', payload: unknown) => createEnvelope(type, payload, 'c');

describe('TripCopiesHandler.scheduled', () => {
  it('keeps the trip as scheduled and marks its route as having trips', async () => {
    const { tx, handler } = setup();

    await handler.scheduled(
      exampleTripScheduled,
      env('TripScheduled', exampleTripScheduled),
      tx as never,
    );

    const [insert, route] = tx.$executeRawUnsafe.mock.calls;
    expect(insert[0]).toContain('INSERT INTO trip_copies');
    expect(insert.slice(1)).toEqual([
      exampleTripScheduled.tripId,
      exampleTripScheduled.busId,
      exampleTripScheduled.driverId,
      exampleTripScheduled.routeId,
      exampleTripScheduled.departureAt,
      exampleTripScheduled.estimatedArrivalAt,
      'SCHEDULED',
    ]);
    expect(route).toEqual([
      'UPDATE routes SET has_trips = true WHERE id = $1::uuid',
      exampleTripScheduled.routeId,
    ]);
  });

  it('does not touch routes for a trip without one', async () => {
    const { tx, handler } = setup();
    const rental = { ...exampleTripScheduled, type: 'RENTAL' as const, routeId: null };

    await handler.scheduled(rental, env('TripScheduled', rental), tx as never);

    expect(statements(tx)).toHaveLength(1);
  });

  it('fills the window and the route of a copy that a departure created first, and marks the route', async () => {
    const { tx, handler } = setup({ current: 'IN_TRANSIT' });

    await handler.scheduled(
      exampleTripScheduled,
      env('TripScheduled', exampleTripScheduled),
      tx as never,
    );

    const [window, route] = tx.$executeRawUnsafe.mock.calls;
    expect(String(window[0]).replace(/\s+/g, ' ')).toContain(
      "UPDATE trip_copies SET route_id = $2::uuid, departure_at = $3::timestamptz, estimated_arrival_at = $4::timestamptz WHERE trip_id = $1::uuid AND status <> 'COMPLETED'",
    );
    expect(window.slice(1)).toEqual([
      exampleTripScheduled.tripId,
      exampleTripScheduled.routeId,
      exampleTripScheduled.departureAt,
      exampleTripScheduled.estimatedArrivalAt,
    ]);
    expect(route).toEqual([
      'UPDATE routes SET has_trips = true WHERE id = $1::uuid',
      exampleTripScheduled.routeId,
    ]);
  });

  it('does not rewrite the window when the schedule is the one that created the copy', async () => {
    const { tx, handler } = setup();

    await handler.scheduled(
      exampleTripScheduled,
      env('TripScheduled', exampleTripScheduled),
      tx as never,
    );

    expect(statements(tx).filter((sql) => sql.startsWith('UPDATE trip_copies'))).toHaveLength(0);
  });

  it('ignores the trips of buses that are not in flota', async () => {
    const { tx, handler } = setup({ ownsBus: false });

    await handler.scheduled(
      exampleTripScheduled,
      env('TripScheduled', exampleTripScheduled),
      tx as never,
    );

    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('rejects a malformed payload without writing', async () => {
    const { tx, handler } = setup();

    await expect(
      handler.scheduled({ tripId: 'x' }, env('TripScheduled', {}), tx as never),
    ).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('falls back to the service client outside the inbox transaction', async () => {
    const { prisma, handler } = setup();
    prisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);
    prisma.$executeRawUnsafe.mockResolvedValue(1);

    await handler.scheduled(exampleTripScheduled, env('TripScheduled', exampleTripScheduled));

    expect(prisma.$executeRawUnsafe).toHaveBeenCalled();
  });
});

describe('TripCopiesHandler.deleted', () => {
  it('forgets the copy only while the trip has not started', async () => {
    const { tx, handler } = setup();

    await handler.deleted(
      exampleTripDeleted,
      env('TripScheduled', exampleTripDeleted),
      tx as never,
    );

    expect(statements(tx)).toEqual([
      `DELETE FROM trip_copies WHERE trip_id = $1::uuid AND status = 'SCHEDULED'`,
    ]);
    expect(tx.$executeRawUnsafe.mock.calls[0][1]).toBe(exampleTripDeleted.tripId);
  });
});

describe('TripCopiesHandler.departed', () => {
  it('moves the copy on the road and the bus with it', async () => {
    const { tx, handler } = setup({ current: 'SCHEDULED' });

    await handler.departed(
      exampleTripDeparted,
      env('TripScheduled', exampleTripDeparted),
      tx as never,
    );

    const [insert, bus] = tx.$executeRawUnsafe.mock.calls;
    expect(insert[0]).toContain('INSERT INTO trip_copies');
    expect(insert[7]).toBe('IN_TRANSIT');
    expect(bus).toEqual([
      'UPDATE buses SET in_transit = true WHERE id = $1::uuid',
      exampleTripDeparted.busId,
    ]);
  });

  it('changes nothing when the trip is already on the road or done', async () => {
    const { tx, handler } = setup({ current: 'COMPLETED' });

    await handler.departed(
      exampleTripDeparted,
      env('TripScheduled', exampleTripDeparted),
      tx as never,
    );

    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('ignores the trips of buses that are not in flota', async () => {
    const { tx, handler } = setup({ ownsBus: false });

    await handler.departed(
      exampleTripDeparted,
      env('TripScheduled', exampleTripDeparted),
      tx as never,
    );

    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});

describe('TripCopiesHandler.completed', () => {
  it('completes the copy, frees the bus, keeps its mileage and counts the trip once', async () => {
    const { tx, handler } = setup({ current: 'IN_TRANSIT' });

    await handler.completed(
      exampleTripCompleted,
      env('TripScheduled', exampleTripCompleted),
      tx as never,
    );

    const [insert, bus, driver] = tx.$executeRawUnsafe.mock.calls;
    expect(insert[7]).toBe('COMPLETED');
    expect(String(bus[0])).toContain('in_transit = false');
    expect(String(bus[0])).toContain('completed_trips = completed_trips + 1');
    expect(String(bus[0])).toContain('GREATEST(mileage_km, $2)');
    expect(bus.slice(1)).toEqual([exampleTripCompleted.busId, exampleTripCompleted.endMileageKm]);
    expect(driver).toEqual([
      'UPDATE drivers SET completed_trips = completed_trips + 1 WHERE id = $1::uuid',
      exampleTripCompleted.driverId,
    ]);
  });

  it('counts nothing when the trip was already completed', async () => {
    const { tx, handler } = setup({ current: 'COMPLETED' });

    await handler.completed(
      exampleTripCompleted,
      env('TripScheduled', exampleTripCompleted),
      tx as never,
    );

    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('ignores the trips of buses that are not in flota', async () => {
    const { tx, handler } = setup({ ownsBus: false });

    await handler.completed(
      exampleTripCompleted,
      env('TripScheduled', exampleTripCompleted),
      tx as never,
    );

    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
