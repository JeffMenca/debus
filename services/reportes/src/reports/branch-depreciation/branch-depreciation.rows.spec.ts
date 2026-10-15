import {
  appliedPerKm,
  toCurrentPerKm,
  toDepreciationRow,
  toDepreciationTotals,
} from './branch-depreciation.rows';

describe('depreciation rows', () => {
  const raw = {
    id: '1f0e2d3c-4b5a-4968-8776-655443322110',
    plate: 'C482BTX',
    brand: 'Volvo',
    model: 'B8R',
    trips: 2,
    km: 300,
    accumulated: 400,
  };

  it('averages the amounts fixed on each trip over the kilometres travelled', () => {
    expect(appliedPerKm(250, 200)).toBe(1.25);
    expect(appliedPerKm(0, 0)).toBeNull();
    expect(appliedPerKm(301.5, 201)).toBe(1.5);
    expect(appliedPerKm(400, 300)).toBe(1.33);
  });

  it('maps a raw row to the contract row with the applied amount per km', () => {
    expect(toDepreciationRow(raw)).toEqual({
      busId: raw.id,
      plate: 'C482BTX',
      brand: 'Volvo',
      model: 'B8R',
      completedTrips: 2,
      kmTraveled: 300,
      appliedPerKm: 1.33,
      accumulated: 400,
    });
  });

  it('leaves the applied amount empty for a bus that did not travel', () => {
    expect(toDepreciationRow({ ...raw, trips: 0, km: 0, accumulated: 0 })).toMatchObject({
      appliedPerKm: null,
      kmTraveled: 0,
      accumulated: 0,
    });
  });

  it('reads the totals of the filtered set with the rate in force', () => {
    expect(toDepreciationTotals({ buses: 3, km: 300, accumulated: 400 }, 1.5)).toEqual({
      kmTraveled: 300,
      accumulated: 400,
      currentPerKm: 1.5,
    });
    expect(toDepreciationTotals(undefined, null)).toEqual({
      kmTraveled: 0,
      accumulated: 0,
      currentPerKm: null,
    });
  });

  it('reads the rate in force, or nothing when none is configured', () => {
    expect(toCurrentPerKm([{ depreciation_per_km: 1.5 }])).toBe(1.5);
    expect(toCurrentPerKm([])).toBeNull();
  });
});
