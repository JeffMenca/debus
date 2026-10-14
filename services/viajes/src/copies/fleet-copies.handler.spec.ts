import {
  FLEET_EXAMPLES,
  createEnvelope,
  exampleBus,
  exampleDriver,
  exampleRoute,
  exampleRouteDeleted,
} from '@debus/contracts';
import { FleetCopiesHandler } from './fleet-copies.handler';

const setup = () => {
  const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1), $queryRawUnsafe: jest.fn() };
  const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
  return { tx, prisma, handler: new FleetCopiesHandler(prisma as never) };
};
const env = (type: 'BusAdded') => createEnvelope(type, {}, 'c');
const sqlOf = (tx: { $executeRawUnsafe: jest.Mock }) =>
  String(tx.$executeRawUnsafe.mock.calls[0]?.[0]);
const valuesOf = (tx: { $executeRawUnsafe: jest.Mock }) =>
  tx.$executeRawUnsafe.mock.calls[0]?.slice(1);

describe('FleetCopiesHandler buses', () => {
  it.each(['busAdded', 'busUpdated', 'busDeactivated'] as const)(
    'keeps the newest snapshot of a bus on %s',
    async (method) => {
      const { tx, handler } = setup();

      await handler[method](exampleBus, env('BusAdded'), tx as never);

      expect(sqlOf(tx)).toContain('INSERT INTO bus_copies');
      expect(sqlOf(tx)).toContain('WHERE bus_copies.version < EXCLUDED.version');
      expect(valuesOf(tx)).toEqual([
        exampleBus.busId,
        exampleBus.branchId,
        'C482BTX',
        40,
        'AVAILABLE',
        true,
        exampleBus.assignedDriverId,
        1,
        exampleBus.mileageKm,
      ]);
    },
  );

  it('rejects a malformed payload without writing', async () => {
    const { tx, handler } = setup();

    await expect(handler.busAdded({ busId: 'x' }, env('BusAdded'), tx as never)).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});

describe('FleetCopiesHandler drivers', () => {
  it.each(['driverAdded', 'driverUpdated'] as const)(
    'keeps the newest snapshot of a driver on %s',
    async (method) => {
      const { tx, handler } = setup();

      await handler[method](exampleDriver, env('BusAdded'), tx as never);

      expect(sqlOf(tx)).toContain('INSERT INTO driver_copies');
      expect(sqlOf(tx)).toContain('WHERE driver_copies.version < EXCLUDED.version');
      expect(valuesOf(tx)).toEqual([
        exampleDriver.driverId,
        exampleDriver.branchId,
        'Julio Pérez',
        '2027-03-01',
        350,
        true,
        1,
      ]);
    },
  );
});

describe('FleetCopiesHandler routes', () => {
  it.each(['routeCreated', 'routeUpdated'] as const)(
    'keeps the newest snapshot of a route on %s, unless it was deleted',
    async (method) => {
      const { tx, handler } = setup();

      await handler[method](exampleRoute, env('BusAdded'), tx as never);

      expect(sqlOf(tx)).toContain('INSERT INTO route_copies');
      expect(sqlOf(tx)).toContain(
        'route_copies.version < EXCLUDED.version AND NOT route_copies.deleted',
      );
      expect(valuesOf(tx)).toEqual([
        exampleRoute.routeId,
        exampleRoute.originBranchId,
        exampleRoute.destinationBranchId,
        201.5,
        85,
        true,
        1,
      ]);
    },
  );

  it('keeps a tombstone of a deleted route so a late snapshot cannot bring it back', async () => {
    const { tx, handler } = setup();

    await handler.routeDeleted(exampleRouteDeleted, env('BusAdded'), tx as never);

    expect(sqlOf(tx)).toContain('deleted = true');
    expect(valuesOf(tx)).toEqual([exampleRouteDeleted.routeId, null, null]);
  });

  it('keeps the branches of a deleted route when the event carries them', async () => {
    const { tx, handler } = setup();
    const payload = {
      routeId: exampleRouteDeleted.routeId,
      originBranchId: exampleRoute.originBranchId,
      destinationBranchId: exampleRoute.destinationBranchId,
    };

    await handler.routeDeleted(payload, env('BusAdded'), tx as never);

    expect(valuesOf(tx)).toEqual([
      payload.routeId,
      payload.originBranchId,
      payload.destinationBranchId,
    ]);
  });
});

describe('FleetCopiesHandler outside the inbox transaction', () => {
  it('falls back to the service client', async () => {
    const { prisma, handler } = setup();

    await handler.busAdded(exampleBus, env('BusAdded'));
    await handler.driverAdded(exampleDriver, env('BusAdded'));
    await handler.routeCreated(exampleRoute, env('BusAdded'));
    await handler.routeDeleted(exampleRouteDeleted, env('BusAdded'));

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(4);
  });

  it('knows an example for every event it follows', () => {
    expect(Object.keys(FLEET_EXAMPLES)).toEqual(
      expect.arrayContaining([
        'BusAdded',
        'BusUpdated',
        'BusDeactivated',
        'DriverAdded',
        'DriverUpdated',
        'RouteCreated',
        'RouteUpdated',
        'RouteDeleted',
      ]),
    );
  });
});
