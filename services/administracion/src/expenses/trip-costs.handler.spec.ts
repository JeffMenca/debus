import { createEnvelope, exampleTripCompleted } from '@debus/contracts';
import { TripCostsHandler } from './trip-costs.handler';

const setup = () => {
  const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
  const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
  return { tx, prisma, handler: new TripCostsHandler(prisma as never) };
};
const envelope = createEnvelope('TripCompleted', {}, 'c');

describe('TripCostsHandler', () => {
  it('keeps the fuel and the depreciation of the completed trip once', async () => {
    const { tx, prisma, handler } = setup();

    await handler.completed(exampleTripCompleted, envelope, tx as never);

    const [sql, ...values] = tx.$executeRawUnsafe.mock.calls[0] ?? [];
    expect(String(sql)).toContain('INSERT INTO trip_costs');
    expect(String(sql)).toContain('ON CONFLICT (trip_id) DO NOTHING');
    expect(values).toEqual([
      exampleTripCompleted.tripId,
      exampleTripCompleted.branchId,
      exampleTripCompleted.busId,
      'REGULAR',
      exampleTripCompleted.arrivedAt,
      202,
      1250,
      1.5,
      303,
      350,
    ]);
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('keeps the costs of a rental trip with its type', async () => {
    const { tx, handler } = setup();

    await handler.completed(
      { ...exampleTripCompleted, type: 'RENTAL', routeId: null },
      envelope,
      tx as never,
    );

    expect(tx.$executeRawUnsafe.mock.calls[0]?.[4]).toBe('RENTAL');
  });

  it('writes through the service client when the inbox gives no transaction', async () => {
    const { prisma, handler } = setup();

    await handler.completed(exampleTripCompleted, envelope);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed payload without writing', async () => {
    const { tx, handler } = setup();

    await expect(handler.completed({ tripId: 'x' }, envelope, tx as never)).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
