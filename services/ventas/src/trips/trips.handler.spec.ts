import { createEnvelope, exampleTripDeleted, exampleTripScheduled } from '@debus/contracts';
import { TripsHandler } from './trips.handler';

const envelope = createEnvelope('TripScheduled', exampleTripScheduled, 'c');
const sqlClient = () => ({
  $executeRawUnsafe: jest.fn().mockResolvedValue(1),
  $queryRawUnsafe: jest.fn(),
});

describe('TripsHandler', () => {
  const handler = new TripsHandler({} as never, {} as never);

  it('copies a regular trip once, even if the event comes back', async () => {
    const tx = sqlClient();

    await handler.scheduled(exampleTripScheduled, envelope, tx);

    const [[sql, ...values]] = tx.$executeRawUnsafe.mock.calls;
    expect(sql).toContain('ON CONFLICT (trip_id) DO NOTHING');
    // A trip deleted before its copy arrived never comes back.
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM deleted_trips');
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

    await new TripsHandler(prisma as never, {} as never).scheduled(exampleTripScheduled, envelope);

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

    await handler.scheduled(rental, envelope, tx);

    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('rejects a payload that breaks the contract', async () => {
    const tx = sqlClient();

    await expect(handler.scheduled({ tripId: 'x' }, envelope, tx)).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});

describe('TripsHandler.deleted', () => {
  const deletedEnvelope = createEnvelope('TripDeleted', exampleTripDeleted, 'corr-1');
  const refund = {
    id: '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b',
    client_id: '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a',
    seats: [5],
    amount: 85,
    nit: 'CF',
    origin_label: 'Quetzaltenango',
    destination_label: 'Guatemala',
    departure_at: new Date(exampleTripDeleted.departureAt),
  };
  const setup = (refunds: unknown[] = [refund], deleted = 1) => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue(refunds),
      $executeRawUnsafe: jest.fn().mockResolvedValue(deleted),
    };
    const outbox = { add: jest.fn().mockResolvedValue(undefined) };
    return { tx, outbox, handler: new TripsHandler(tx as never, outbox as never) };
  };

  it('closes the purchases, asks to refund those that may have been charged and drops the copy', async () => {
    const { tx, outbox, handler } = setup();

    await handler.deleted(exampleTripDeleted, deletedEnvelope, tx);

    const [[lock, ...lockValues], [close, ...closeValues]] = tx.$queryRawUnsafe.mock.calls;
    // Waits for any reservation in flight: its ticket holds a key share lock on the trip row.
    expect(lock).toContain('FOR UPDATE');
    expect(lockValues).toEqual([exampleTripDeleted.tripId]);
    expect(close).toContain("status = 'FAILED', failure = 'TRIP_CANCELLED'");
    expect(close).toContain("status IN ('PENDING', 'CONFIRMED')");
    expect(close).toContain('debit_attempts > 0');
    expect(closeValues).toEqual([exampleTripDeleted.tripId]);
    expect(outbox.add).toHaveBeenCalledWith(
      tx,
      'RefundRequested',
      expect.objectContaining({
        ticketId: refund.id,
        tripId: exampleTripDeleted.tripId,
        amount: 85,
        requestedAt: deletedEnvelope.occurredAt,
      }),
      'corr-1',
    );
    const [[drop, ...dropValues]] = tx.$executeRawUnsafe.mock.calls;
    expect(drop).toContain('DELETE FROM trips');
    expect(dropValues).toEqual([exampleTripDeleted.tripId]);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('remembers a trip deleted before its copy arrived', async () => {
    const { tx, outbox, handler } = setup([], 0);

    await handler.deleted(exampleTripDeleted, deletedEnvelope, tx);

    expect(outbox.add).not.toHaveBeenCalled();
    const [, [bury, ...buryValues]] = tx.$executeRawUnsafe.mock.calls;
    expect(bury).toContain('INSERT INTO deleted_trips');
    expect(buryValues).toEqual([exampleTripDeleted.tripId]);
  });

  it('ignores a rental, which never had seats on sale', async () => {
    const { tx, handler } = setup();

    await handler.deleted({ ...exampleTripDeleted, type: 'RENTAL' }, deletedEnvelope, tx);

    expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('uses the service client when the inbox gives no transaction', async () => {
    const { tx, handler } = setup([]);

    await handler.deleted(exampleTripDeleted, deletedEnvelope);

    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('rejects a payload that breaks the contract before writing', async () => {
    const { tx, handler } = setup();

    await expect(handler.deleted({ tripId: 'x' }, deletedEnvelope, tx)).rejects.toThrow();
    expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
