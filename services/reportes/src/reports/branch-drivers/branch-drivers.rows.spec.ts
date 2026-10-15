import { toDriverGroups, toDriverRow, toDriverTotals } from './branch-drivers.rows';

describe('driver rows', () => {
  const raw = {
    id: '1f0e2d3c-4b5a-4968-8776-655443322110',
    full_name: 'Ana Pérez',
    license_number: 'A1234567',
    license_type: 'B' as const,
    license_expires_on: new Date('2027-03-01T00:00:00.000Z'),
    active: true,
    completed_trips: 2,
  };

  it('maps a raw row to the contract row with the licence date as a day', () => {
    expect(toDriverRow(raw)).toEqual({
      driverId: raw.id,
      licenseNumber: 'A1234567',
      fullName: 'Ana Pérez',
      licenseType: 'B',
      licenseExpiresOn: '2027-03-01',
      active: true,
      completedTrips: 2,
    });
  });

  it('keeps an inactive driver without trips', () => {
    expect(toDriverRow({ ...raw, active: false, completed_trips: 0 })).toMatchObject({
      active: false,
      completedTrips: 0,
    });
  });

  it('reads the totals of the filtered set', () => {
    expect(toDriverTotals({ drivers: 5, completed_trips: 9 })).toEqual({
      drivers: 5,
      completedTrips: 9,
    });
    expect(toDriverTotals(undefined)).toEqual({ drivers: 0, completedTrips: 0 });
  });

  it('lists active and inactive drivers, counting zero for the one without drivers', () => {
    expect(toDriverGroups([{ active: false, drivers: 2 }])).toEqual([
      { active: true, drivers: 0 },
      { active: false, drivers: 2 },
    ]);
  });
});
