import { Prisma } from '../generated/prisma/client';
import { SettingsCopyService } from './settings-copy.service';

const row = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  depreciationPerKm: new Prisma.Decimal('1.75'),
  rentalRatePerKm: new Prisma.Decimal('12.00'),
  effectiveFrom: new Date('2026-10-10T00:00:00.000Z'),
  createdAt: new Date('2026-10-10T15:00:00.000Z'),
};

describe('SettingsCopyService.effectiveOn', () => {
  const setup = (found: typeof row | null = row) => {
    const prisma = { settingsVersionCopy: { findFirst: jest.fn().mockResolvedValue(found) } };
    return { prisma, service: new SettingsCopyService(prisma as never) };
  };

  it('picks the latest version starting on or before the date and maps it to plain values', async () => {
    const { prisma, service } = setup();

    expect(await service.effectiveOn('2026-10-10')).toEqual({
      versionId: row.id,
      depreciationPerKm: 1.75,
      rentalRatePerKm: 12,
      effectiveFrom: '2026-10-10',
    });
    expect(prisma.settingsVersionCopy.findFirst).toHaveBeenCalledWith({
      where: { effectiveFrom: { lte: new Date('2026-10-10T00:00:00.000Z') } },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
  });

  it('returns null when no version is in force yet', async () => {
    const { service } = setup(null);

    expect(await service.effectiveOn('2020-01-01')).toBeNull();
  });

  it('refuses a date that is not YYYY-MM-DD before querying', async () => {
    const { prisma, service } = setup();

    await expect(service.effectiveOn('10/10/2026')).rejects.toThrow();
    expect(prisma.settingsVersionCopy.findFirst).not.toHaveBeenCalled();
  });
});
