import { UserRepublishService } from './user-republish.service';

const branch = '9b2c7a10-1111-4c4c-8888-123456789abc';
const admin = (id: string) => ({
  id,
  email: `${id}@correo.com`,
  fullName: 'Marta Choc',
  role: 'BRANCH_ADMIN',
  branchId: branch,
  status: 'ACTIVE',
  version: 5,
});

function setup(pages: string[][]) {
  const tx = { user: { update: jest.fn(({ where }) => Promise.resolve(admin(where.id))) } };
  const prisma = { user: { findMany: jest.fn() }, $transaction: jest.fn((work) => work(tx)) };
  for (const page of pages) {
    prisma.user.findMany.mockResolvedValueOnce(page.map((id) => ({ id })));
  }
  prisma.user.findMany.mockResolvedValue([]);
  const events = { userUpdated: jest.fn().mockResolvedValue(undefined), flush: jest.fn() };
  return {
    tx,
    prisma,
    events,
    service: new UserRepublishService(prisma as never, events as never),
  };
}

describe('UserRepublishService', () => {
  it('publishes every account again with the version raised, so the copies take it', async () => {
    const { tx, prisma, events, service } = setup([['a1', 'a2']]);

    await expect(service.republish(undefined, 'c-1')).resolves.toEqual({ republished: 2 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { branchId: undefined } }),
    );
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { version: { increment: 1 } },
    });
    expect(events.userUpdated).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: 'a1', role: 'BRANCH_ADMIN', version: 5 }),
      'c-1',
    );
    expect(events.flush).toHaveBeenCalledTimes(1);
  });

  it('does not filter by role, so a cashier or a client is republished too', async () => {
    const { prisma, service } = setup([]);

    await service.republish();

    const [[args]] = prisma.user.findMany.mock.calls;
    expect(args.where).not.toHaveProperty('role');
  });

  it('can limit the republish to one branch', async () => {
    const { prisma, service } = setup([]);

    await service.republish(branch);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { branchId: branch } }),
    );
  });

  it('flushes nothing when there is no account', async () => {
    const { events, service } = setup([]);

    await expect(service.republish()).resolves.toEqual({ republished: 0 });
    expect(events.flush).not.toHaveBeenCalled();
  });
});
