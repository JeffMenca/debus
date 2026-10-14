import { ConflictException, Logger } from '@nestjs/common';
import { TripWrites } from './trip-writes';

const busId = '1f0e2d3c-4b5a-4968-8776-655443322110';
const driverId = '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const routeId = '3b2c1d0e-6f5a-4b4c-9d8e-7f6a5b4c3d2e';
const target = { busId, driverId, routeId };

const setup = () => {
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    busCopy: { findUnique: jest.fn().mockResolvedValue({ active: true }) },
    driverCopy: { findUnique: jest.fn().mockResolvedValue({ active: true }) },
    routeCopy: {
      findUnique: jest.fn().mockResolvedValue({ active: true, deleted: false }),
    },
  };
  const prisma = { $transaction: jest.fn((work) => work(tx)) };
  return { tx, prisma, writes: new TripWrites(prisma as never) };
};

describe('TripWrites', () => {
  it('queues behind the trips of the same bus and then the same driver, before the work', async () => {
    const { tx, writes } = setup();
    const work = jest.fn().mockResolvedValue('trip');

    const result = await writes.write(target, work);

    expect(result).toBe('trip');
    expect(tx.$executeRawUnsafe.mock.calls).toEqual([
      ['SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', `trip-bus:${busId}`],
      ['SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', `trip-driver:${driverId}`],
    ]);
    expect(work).toHaveBeenCalledWith(tx);
    expect(tx.$executeRawUnsafe.mock.invocationCallOrder[1]).toBeLessThan(
      work.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('waits for a connection while simultaneous trips queue for the same hours', async () => {
    const { prisma, writes } = setup();

    await writes.write(target, jest.fn());

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 10_000 });
  });

  it('refuses a bus, a driver or a route that was deactivated meanwhile, and runs no work', async () => {
    const { tx, writes } = setup();
    const work = jest.fn();

    tx.busCopy.findUnique.mockResolvedValue({ active: false });
    await expect(writes.write(target, work)).rejects.toThrow(
      new ConflictException('Ese bus está desactivado.'),
    );
    tx.busCopy.findUnique.mockResolvedValue({ active: true });
    tx.driverCopy.findUnique.mockResolvedValue(null);
    await expect(writes.write(target, work)).rejects.toThrow(
      new ConflictException('Ese chofer está desactivado.'),
    );
    tx.driverCopy.findUnique.mockResolvedValue({ active: true });
    tx.routeCopy.findUnique.mockResolvedValue({ active: true, deleted: true });
    await expect(writes.write(target, work)).rejects.toThrow(
      new ConflictException('Elige una ruta activa que salga de tu sucursal.'),
    );
    expect(work).not.toHaveBeenCalled();
  });

  it('has no route to check for a rental', async () => {
    const { tx, writes } = setup();

    await writes.write({ busId, driverId, routeId: null }, jest.fn());

    expect(tx.routeCopy.findUnique).not.toHaveBeenCalled();
  });

  it('turns the exclusion constraints into the text of the busy bus or driver', async () => {
    const { prisma, writes } = setup();

    prisma.$transaction.mockRejectedValueOnce(new Error('violates "trips_bus_no_overlap"'));
    await expect(writes.write(target, jest.fn())).rejects.toThrow(
      new ConflictException('Ese bus ya tiene un viaje en ese horario.'),
    );
    prisma.$transaction.mockRejectedValueOnce({ message: 'violates "trips_driver_no_overlap"' });
    await expect(writes.write(target, jest.fn())).rejects.toThrow(
      new ConflictException('Ese chofer ya tiene un viaje en ese horario.'),
    );
    prisma.$transaction.mockRejectedValueOnce(new Error('boom'));
    await expect(writes.write(target, jest.fn())).rejects.toThrow('boom');
  });

  it('tries again after a deadlock and logs the code of every retry', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { prisma, writes } = setup();
    prisma.$transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockRejectedValueOnce({ code: 'P2028' });

    await writes.write(target, jest.fn().mockResolvedValue('trip'));

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenNthCalledWith(
      1,
      { attempt: 1, code: 'P2034' },
      'Trying the trip again after a database conflict',
    );
    expect(warn).toHaveBeenNthCalledWith(
      2,
      { attempt: 2, code: 'P2028' },
      'Trying the trip again after a database conflict',
    );
    warn.mockRestore();
  });

  it('gives up after five deadlocks with an honest conflict, never a server error', async () => {
    const { prisma, writes } = setup();
    prisma.$transaction.mockRejectedValue({ code: 'P2034' });

    await expect(writes.write(target, jest.fn())).rejects.toThrow(
      new ConflictException(
        'Otro viaje se está programando justo ahora. Intenta de nuevo en unos segundos.',
      ),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(5);
  });
});
