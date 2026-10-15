import { RouteRepublishService } from './route-republish.service';

const route = (id: string, version: number) => ({
  id,
  originBranchId: 'origin',
  destinationBranchId: 'destination',
  distanceKm: { toNumber: () => 205.5 },
  ticketPrice: { toNumber: () => 90 },
  active: true,
  version,
});

function setup(pages: string[][]) {
  const tx = { route: { update: jest.fn(({ where }) => Promise.resolve(route(where.id, 4))) } };
  const prisma = {
    route: { findMany: jest.fn() },
    $transaction: jest.fn((work) => work(tx)),
  };
  for (const page of pages) prisma.route.findMany.mockResolvedValueOnce(page.map((id) => ({ id })));
  prisma.route.findMany.mockResolvedValue([]);
  const events = { route: jest.fn().mockResolvedValue(undefined), flush: jest.fn() };
  return {
    tx,
    prisma,
    events,
    service: new RouteRepublishService(prisma as never, events as never),
  };
}

describe('RouteRepublishService', () => {
  it('raises the version of every route that leaves the branch and queues a RouteUpdated for it', async () => {
    const { tx, prisma, events, service } = setup([['a', 'b']]);

    await expect(service.republish('origin', 'c-1')).resolves.toEqual({ republished: 2 });

    expect(prisma.route.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { originBranchId: 'origin' } }),
    );
    expect(tx.route.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { version: { increment: 1 } },
    });
    expect(events.route).toHaveBeenCalledWith(
      tx,
      'RouteUpdated',
      expect.objectContaining({ routeId: 'a', version: 4, distanceKm: 205.5 }),
      'c-1',
    );
    expect(events.flush).toHaveBeenCalledTimes(1);
  });

  it('takes every route when no branch is given and flushes nothing when there are none', async () => {
    const { prisma, events, service } = setup([]);

    await expect(service.republish()).resolves.toEqual({ republished: 0 });
    expect(prisma.route.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { originBranchId: undefined } }),
    );
    expect(events.flush).not.toHaveBeenCalled();
  });
});
