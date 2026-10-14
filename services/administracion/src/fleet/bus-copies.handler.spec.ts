import { createEnvelope, exampleBus } from '@debus/contracts';
import { BusCopiesHandler } from './bus-copies.handler';

const setup = () => {
  const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
  const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
  return { tx, prisma, handler: new BusCopiesHandler(prisma as never) };
};
const envelope = createEnvelope('BusAdded', {}, 'c');

describe('BusCopiesHandler', () => {
  it.each(['added', 'updated', 'deactivated'] as const)(
    'keeps the newest snapshot of a bus on %s',
    async (method) => {
      const { tx, prisma, handler } = setup();

      await handler[method](exampleBus, envelope, tx as never);

      const [sql, ...values] = tx.$executeRawUnsafe.mock.calls[0] ?? [];
      expect(String(sql)).toContain('INSERT INTO bus_copies');
      expect(String(sql)).toContain('WHERE bus_copies.version < EXCLUDED.version');
      expect(values).toEqual([
        exampleBus.busId,
        exampleBus.branchId,
        exampleBus.plate,
        exampleBus.active,
        exampleBus.version,
      ]);
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    },
  );

  it('writes through the service client when the inbox gives no transaction', async () => {
    const { prisma, handler } = setup();

    await handler.added(exampleBus, envelope);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed payload without writing', async () => {
    const { tx, handler } = setup();

    await expect(handler.added({ busId: 'x' }, envelope, tx as never)).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
