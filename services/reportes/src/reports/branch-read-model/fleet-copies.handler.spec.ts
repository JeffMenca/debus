import { createEnvelope, exampleBus, exampleDriver } from '@debus/contracts';
import { FleetCopiesHandler } from './fleet-copies.handler';

const setup = () => {
  const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1), $queryRawUnsafe: jest.fn() };
  const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
  return { tx, prisma, handler: new FleetCopiesHandler(prisma as never) };
};
const envelope = createEnvelope('BusAdded', {}, 'c');
const sqlOf = (tx: { $executeRawUnsafe: jest.Mock }) =>
  String(tx.$executeRawUnsafe.mock.calls[0]?.[0]);
const valuesOf = (tx: { $executeRawUnsafe: jest.Mock }) =>
  tx.$executeRawUnsafe.mock.calls[0]?.slice(1);

describe('FleetCopiesHandler buses', () => {
  it.each(['busAdded', 'busUpdated', 'busDeactivated'] as const)(
    'keeps the newest snapshot of a bus on %s',
    async (method) => {
      const { tx, handler } = setup();

      await handler[method](exampleBus, envelope, tx);

      expect(sqlOf(tx)).toContain('INSERT INTO branch_report_buses');
      expect(sqlOf(tx)).toContain('WHERE branch_report_buses.version < EXCLUDED.version');
      expect(valuesOf(tx)).toEqual([
        exampleBus.busId,
        exampleBus.branchId,
        'C482BTX',
        'Volvo',
        'B8R',
        40,
        'AVAILABLE',
        true,
        exampleBus.assignedDriverId,
        exampleBus.mileageKm,
        1,
      ]);
    },
  );

  it('rejects a malformed bus without writing', async () => {
    const { tx, handler } = setup();

    await expect(handler.busAdded({ busId: 'x' }, envelope, tx)).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('falls back to the service client outside the inbox transaction', async () => {
    const { prisma, handler } = setup();

    await handler.busAdded(exampleBus, envelope);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});

describe('FleetCopiesHandler drivers', () => {
  it.each(['driverAdded', 'driverUpdated'] as const)(
    'keeps the newest snapshot of a driver on %s',
    async (method) => {
      const { tx, handler } = setup();

      await handler[method](exampleDriver, envelope, tx);

      expect(sqlOf(tx)).toContain('INSERT INTO branch_report_drivers');
      expect(sqlOf(tx)).toContain('WHERE branch_report_drivers.version < EXCLUDED.version');
      expect(valuesOf(tx)).toEqual([
        exampleDriver.driverId,
        exampleDriver.branchId,
        'Julio Pérez',
        'A1234567',
        'A',
        '2027-03-01',
        true,
        1,
      ]);
    },
  );

  it('falls back to the service client for a driver outside the inbox transaction', async () => {
    const { prisma, handler } = setup();

    await handler.driverAdded(exampleDriver, envelope);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed driver without writing', async () => {
    const { tx, handler } = setup();

    await expect(handler.driverAdded({ driverId: 'x' }, envelope, tx)).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
