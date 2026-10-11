import { Prisma } from '../generated/prisma/client';
import { fromDateOnly, toDateOnly, toSettingsPayload, toSettingsVersion } from './settings-mappers';

const row = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  depreciationPerKm: new Prisma.Decimal('1.25'),
  rentalRatePerKm: new Prisma.Decimal('12.00'),
  effectiveFrom: new Date('2026-10-10T00:00:00.000Z'),
  createdById: '9b2c7a10-1111-4c4c-8888-123456789abc',
  createdAt: new Date('2026-10-10T15:00:00.000Z'),
};

describe('settings mappers', () => {
  it('keeps calendar dates without time zone shifts', () => {
    expect(toDateOnly(fromDateOnly('2026-10-10'))).toBe('2026-10-10');
  });

  it('maps a version for the API and for the event', () => {
    expect(toSettingsVersion(row, 'Marta Ruiz')).toEqual({
      id: row.id,
      depreciationPerKm: 1.25,
      rentalRatePerKm: 12,
      effectiveFrom: '2026-10-10',
      createdAt: '2026-10-10T15:00:00.000Z',
      createdByName: 'Marta Ruiz',
    });
    expect(toSettingsPayload(row)).toEqual({
      versionId: row.id,
      depreciationPerKm: 1.25,
      rentalRatePerKm: 12,
      effectiveFrom: '2026-10-10',
      createdAt: '2026-10-10T15:00:00.000Z',
    });
  });
});
