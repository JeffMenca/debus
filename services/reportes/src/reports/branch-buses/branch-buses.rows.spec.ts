import { currentMileage, toBusRow, toBusTotals, toStatusGroups } from './branch-buses.rows';

describe('currentMileage', () => {
  it('keeps the highest mileage between the bus copy and its last arrival', () => {
    expect(currentMileage(1000, 1204)).toBe(1204);
    expect(currentMileage(1500, 1204)).toBe(1500);
    expect(currentMileage(1000, null)).toBe(1000);
  });
});

describe('bus rows', () => {
  const raw = {
    id: '1f0e2d3c-4b5a-4968-8776-655443322110',
    plate: 'C482BTX',
    brand: 'Volvo',
    model: 'B8R',
    capacity: 40,
    mileage_km: 1000,
    driver_name: 'Ana Pérez',
    completed_trips: 3,
    last_mileage_km: 1204,
    status: 'AVAILABLE' as const,
  };

  it('maps a raw row to the contract row with the current mileage', () => {
    expect(toBusRow(raw)).toEqual({
      busId: raw.id,
      plate: 'C482BTX',
      brand: 'Volvo',
      model: 'B8R',
      capacity: 40,
      status: 'AVAILABLE',
      driverName: 'Ana Pérez',
      mileageKm: 1204,
      completedTrips: 3,
    });
  });

  it('keeps a bus without driver and without trips', () => {
    expect(
      toBusRow({ ...raw, driver_name: null, completed_trips: 0, last_mileage_km: null }),
    ).toMatchObject({
      driverName: null,
      completedTrips: 0,
      mileageKm: 1000,
    });
  });

  it('reads the totals of the filtered set', () => {
    expect(toBusTotals({ buses: 5, completed_trips: 2 })).toEqual({ buses: 5, completedTrips: 2 });
    expect(toBusTotals(undefined)).toEqual({ buses: 0, completedTrips: 0 });
  });

  it('lists every status in display order, counting zero for the ones without buses', () => {
    expect(
      toStatusGroups([
        { status: 'INACTIVE', buses: 2 },
        { status: 'AVAILABLE', buses: 1 },
      ]),
    ).toEqual([
      { status: 'IN_TRANSIT', buses: 0 },
      { status: 'AVAILABLE', buses: 1 },
      { status: 'IN_WORKSHOP', buses: 0 },
      { status: 'INACTIVE', buses: 2 },
    ]);
  });
});
