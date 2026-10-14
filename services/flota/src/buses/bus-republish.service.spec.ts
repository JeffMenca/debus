import { BusRepublishService } from './bus-republish.service';

const bus = (id: string, version: number) => ({
  id,
  branchId: 'branch',
  plate: `P${id}`,
  brand: 'Volvo',
  model: 'B8R',
  year: 2021,
  capacity: 40,
  mileageKm: 1000,
  operationalStatus: 'AVAILABLE',
  assignedDriverId: null,
  active: true,
  version,
});

function setup(ids: string[][]) {
  const tx = {
    bus: {
      update: jest.fn(({ where }) => Promise.resolve(bus(where.id, 2))),
    },
  };
  const prisma = {
    bus: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn((work) => work(tx)),
  };
  for (const page of ids) prisma.bus.findMany.mockResolvedValueOnce(page.map((id) => ({ id })));
  prisma.bus.findMany.mockResolvedValue([]);
  const events = { bus: jest.fn().mockResolvedValue(undefined), flush: jest.fn() };
  return { tx, prisma, events, service: new BusRepublishService(prisma as never, events as never) };
}

describe('BusRepublishService', () => {
  it('raises the version of every bus and queues a BusUpdated for it, in the same transaction', async () => {
    const { tx, prisma, events, service } = setup([['a', 'b']]);

    const result = await service.republish('branch', 'c-1');

    expect(result).toEqual({ republished: 2 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.bus.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { branchId: 'branch' } }),
    );
    expect(tx.bus.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { version: { increment: 1 } },
    });
    expect(events.bus).toHaveBeenCalledWith(
      tx,
      'BusUpdated',
      expect.objectContaining({ busId: 'a', version: 2, mileageKm: 1000 }),
      'c-1',
    );
    expect(events.bus).toHaveBeenCalledTimes(2);
    expect(events.flush).toHaveBeenCalledTimes(1);
  });

  it('walks the buses in pages by id, so a big fleet never lands in one transaction', async () => {
    const { prisma, service } = setup([['a', 'b'], ['c']]);

    const result = await service.republish();

    expect(result).toEqual({ republished: 3 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.bus.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ orderBy: { id: 'asc' } }),
    );
    expect(prisma.bus.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: { id: 'b' }, skip: 1 }),
    );
  });

  it('does nothing, and flushes nothing, when there are no buses', async () => {
    const { prisma, events, service } = setup([]);

    await expect(service.republish()).resolves.toEqual({ republished: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(events.flush).not.toHaveBeenCalled();
  });
});
