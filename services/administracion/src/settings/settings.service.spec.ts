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
    settingsVersion: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ fullName: 'Marta Ruiz' }),
    },
    $transaction: jest.fn((fn) => fn(tx)),
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

describe('SettingsService.overview', () => {
  it('returns nothing before the first version', async () => {
    const { service } = setup();

    expect(await service.overview(now)).toEqual({ current: null, versions: [] });
  });

  it('lists newest first with author names from one query and picks the one in force today', async () => {
    const { prisma, service } = setup();
    const author = '9b2c7a10-1111-4c4c-8888-123456789abc';
    prisma.settingsVersion.findMany.mockResolvedValue([
      row('future', '2026-11-01', '2026-10-10T09:30:00.000Z', author),
      row('today', '2026-10-10', '2026-10-10T09:00:00.000Z'),
      row('old', '2026-10-01', '2026-09-30T10:00:00.000Z', author),
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: author, fullName: 'Marta Ruiz' }]);

    const overview = await service.overview(now);

    expect(prisma.settingsVersion.findMany).toHaveBeenCalledWith({
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: [author, admin.userId].sort((a, b) => (a < b ? 1 : -1)) } },
      select: { id: true, fullName: true },
    });
    expect(overview.versions.map((version) => version.id)).toEqual(['future', 'today', 'old']);
    expect(overview.versions[0]?.createdByName).toBe('Marta Ruiz');
    expect(overview.versions[1]?.createdByName).toBeNull();
    expect(overview.current?.id).toBe('today');
  });
});
