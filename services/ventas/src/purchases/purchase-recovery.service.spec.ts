import { Logger } from '@nestjs/common';
import { PurchaseRecoveryService } from './purchase-recovery.service';

function setup(due: string[] = [], released = 0) {
  const prisma = {
    purchase: { findMany: jest.fn().mockResolvedValue(due.map((id) => ({ id }))) },
    ticket: { deleteMany: jest.fn().mockResolvedValue({ count: released }) },
  };
  const purchases = { resume: jest.fn().mockResolvedValue('CONFIRMED') };
  return {
    prisma,
    purchases,
    service: new PurchaseRecoveryService(prisma as never, purchases as never),
  };
}

describe('PurchaseRecoveryService', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('looks for at most ten pending purchases, oldest first, that nobody holds and that rest for a minute', async () => {
    const { prisma, service } = setup();
    const before = Date.now();

    await service.recover();

    const [[query]] = prisma.purchase.findMany.mock.calls;
    expect(query).toMatchObject({
      where: {
        status: 'PENDING',
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: expect.any(Date) } }],
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 10,
      select: { id: true },
    });
    const restedSince = query.where.updatedAt.lt.getTime();
    expect(before - restedSince).toBeGreaterThanOrEqual(59_000);
    expect(before - restedSince).toBeLessThanOrEqual(61_000);
  });

  it('resumes each one and counts what was settled and what is still pending', async () => {
    const { purchases, service } = setup(['a', 'b', 'c']);
    purchases.resume
      .mockResolvedValueOnce('CONFIRMED')
      .mockResolvedValueOnce('PENDING')
      .mockResolvedValueOnce('FAILED');

    const result = await service.recover();

    expect(purchases.resume.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'c']);
    expect(result).toEqual({ resumed: 2, stillPending: 1, releasedCounterTickets: 0 });
  });

  it('keeps going when one purchase cannot be resumed', async () => {
    const { purchases, service } = setup(['a', 'b']);
    purchases.resume.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('CONFIRMED');

    const result = await service.recover();

    expect(result).toEqual({ resumed: 1, stillPending: 1, releasedCounterTickets: 0 });
  });

  it('frees the counter tickets that stayed pending for more than half an hour, and only those', async () => {
    const { prisma, service } = setup([], 2);
    const before = Date.now();

    const result = await service.recover();

    const [[query]] = prisma.ticket.deleteMany.mock.calls;
    expect(query).toMatchObject({ where: { channel: 'COUNTER', status: 'PENDING' } });
    const age = before - query.where.createdAt.lt.getTime();
    expect(age).toBeGreaterThanOrEqual(30 * 60_000 - 1000);
    expect(age).toBeLessThanOrEqual(30 * 60_000 + 1000);
    expect(result.releasedCounterTickets).toBe(2);
  });
});
