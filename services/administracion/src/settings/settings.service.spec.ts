import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { fromDateOnly } from './settings-mappers';
import { SettingsService } from './settings.service';

const admin = {
  userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  role: 'SYSTEM_ADMIN' as const,
  branchId: null,
};
const row = (id: string, effectiveFrom: string, createdAt: string, createdById = admin.userId) => ({
  id,
  depreciationPerKm: new Prisma.Decimal('1.25'),
  rentalRatePerKm: new Prisma.Decimal('12.00'),
  effectiveFrom: fromDateOnly(effectiveFrom),
  createdById,
  createdAt: new Date(createdAt),
});
const input = { depreciationPerKm: 1.35, rentalRatePerKm: 13.5, effectiveFrom: '2026-10-10' };
// 08:00 in Guatemala, so the local day is still 2026-10-10.
const now = new Date('2026-10-10T14:00:00.000Z');

const setup = () => {
  const created = row('v-new', '2026-10-10', '2026-10-10T14:00:00.000Z');
  const tx = { settingsVersion: { create: jest.fn().mockResolvedValue(created) } };
  const prisma = {
    settingsVersion: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ fullName: 'Marta Ruiz' }),
    },
    $transaction: jest.fn((work) => (Array.isArray(work) ? Promise.all(work) : work(tx))),
  };
  const events = {
    settingsUpdated: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
  };
  return {
    tx,
    prisma,
    events,
    created,
    service: new SettingsService(prisma as never, events as never),
  };
};

describe('SettingsService.create', () => {
  it('refuses a date before today in Guatemala and writes nothing', async () => {
    const { prisma, events, service } = setup();

    await expect(
      service.create(admin, { ...input, effectiveFrom: '2026-10-09' }, 'c', now),
    ).rejects.toThrow(new BadRequestException('La fecha de vigencia no puede ser anterior a hoy.'));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(events.flush).not.toHaveBeenCalled();
  });

  it('stores the version, announces it in the transaction and names its author', async () => {
    const { tx, events, created, service } = setup();

    const version = await service.create(admin, input, 'c', now);

    expect(tx.settingsVersion.create).toHaveBeenCalledWith({
      data: {
        depreciationPerKm: 1.35,
        rentalRatePerKm: 13.5,
        effectiveFrom: fromDateOnly('2026-10-10'),
        createdById: admin.userId,
      },
    });
    expect(events.settingsUpdated).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ versionId: created.id, effectiveFrom: '2026-10-10' }),
      'c',
    );
    expect(events.flush).toHaveBeenCalledTimes(1);
    expect(version).toMatchObject({ id: created.id, createdByName: 'Marta Ruiz' });
  });

  it('accepts a future date and keeps the author empty when the account is gone', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(null);

    const version = await service.create(
      admin,
      { ...input, effectiveFrom: '2026-12-01' },
      undefined,
      now,
    );

    expect(version.createdByName).toBeNull();
  });
});

describe('SettingsService.list', () => {
  const author = '9b2c7a10-1111-4c4c-8888-123456789abc';
  const query = { page: 2, pageSize: 1 };

  it('returns an empty page before the first version', async () => {
    const { service } = setup();

    expect(await service.list({ page: 1, pageSize: 20 }, now)).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      summary: { current: null, upcoming: null },
    });
  });

  it('pages the history and finds the version in force and the next one apart from the page', async () => {
    const { prisma, service } = setup();
    const today = row('today', '2026-10-10', '2026-10-10T09:00:00.000Z');
    const future = row('future', '2026-11-01', '2026-10-10T09:30:00.000Z', author);
    prisma.settingsVersion.findMany.mockResolvedValue([today]);
    prisma.settingsVersion.count.mockResolvedValue(3);
    prisma.settingsVersion.findFirst.mockResolvedValueOnce(today).mockResolvedValueOnce(future);
    prisma.user.findMany.mockResolvedValue([{ id: author, fullName: 'Marta Ruiz' }]);

    const page = await service.list(query, now);

    expect(prisma.settingsVersion.findMany).toHaveBeenCalledWith({
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      skip: 1,
      take: 1,
    });
    expect(prisma.settingsVersion.findFirst).toHaveBeenNthCalledWith(1, {
      where: { effectiveFrom: { lte: fromDateOnly('2026-10-10') } },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
    expect(prisma.settingsVersion.findFirst).toHaveBeenNthCalledWith(2, {
      where: { effectiveFrom: { gt: fromDateOnly('2026-10-10') } },
      orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'desc' }],
    });
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(page).toMatchObject({ total: 3, page: 2, pageSize: 1 });
    expect(page.items.map((version) => version.id)).toEqual(['today']);
    expect(page.items[0]?.createdByName).toBeNull();
    expect(page.summary.current?.id).toBe('today');
    expect(page.summary.upcoming).toMatchObject({ id: 'future', createdByName: 'Marta Ruiz' });
  });
});
