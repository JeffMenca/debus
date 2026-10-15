import { BranchRepublishService } from './branch-republish.service';

const branch = (id: string, version: number) => ({
  id,
  code: 'XELA',
  name: 'Quetzaltenango',
  department: 'Quetzaltenango',
  municipality: 'Quetzaltenango',
  address: '4a calle 10-20 zona 3',
  phone: '77610000',
  latitude: { toNumber: () => 14.8347 },
  longitude: { toNumber: () => -91.5181 },
  active: true,
  version,
});

function setup(pages: string[][]) {
  const tx = { branch: { update: jest.fn(({ where }) => Promise.resolve(branch(where.id, 2))) } };
  const prisma = {
    branch: { findMany: jest.fn() },
    $transaction: jest.fn((work) => work(tx)),
  };
  for (const page of pages)
    prisma.branch.findMany.mockResolvedValueOnce(page.map((id) => ({ id })));
  prisma.branch.findMany.mockResolvedValue([]);
  const events = { branchChanged: jest.fn().mockResolvedValue(undefined), flush: jest.fn() };
  return {
    tx,
    prisma,
    events,
    service: new BranchRepublishService(prisma as never, events as never),
  };
}

describe('BranchRepublishService', () => {
  it('raises the version of every branch and queues a BranchUpdated for it', async () => {
    const { tx, prisma, events, service } = setup([['a', 'b']]);

    await expect(service.republish(undefined, 'c-1')).resolves.toEqual({ republished: 2 });

    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: undefined } }),
    );
    expect(tx.branch.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { version: { increment: 1 } },
    });
    expect(events.branchChanged).toHaveBeenCalledWith(
      tx,
      'BranchUpdated',
      expect.objectContaining({ branchId: 'a', version: 2, latitude: 14.8347 }),
      'c-1',
    );
    expect(events.branchChanged).toHaveBeenCalledTimes(2);
    expect(events.flush).toHaveBeenCalledTimes(1);
  });

  it('takes only the given branch', async () => {
    const { prisma, service } = setup([['a']]);

    await service.republish('a');

    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a' } }),
    );
  });

  it('flushes nothing when there are no branches', async () => {
    const { events, service } = setup([]);

    await expect(service.republish()).resolves.toEqual({ republished: 0 });
    expect(events.flush).not.toHaveBeenCalled();
  });
});
