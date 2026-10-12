import { GUATEMALA_BOUNDS, isInsideGuatemala } from '@debus/contracts';
import { GUATEMALA_CENTER, roundCoordinate } from './coordinates';

describe('coordinates', () => {
  it('keeps six decimals, which is about a tenth of a meter', () => {
    expect(roundCoordinate(14.83470123)).toBe(14.834701);
    expect(roundCoordinate(-91.5181)).toBe(-91.5181);
  });

  it('centers the map inside Guatemala', () => {
    expect(isInsideGuatemala(GUATEMALA_CENTER.latitude, GUATEMALA_CENTER.longitude)).toBe(true);
    expect(GUATEMALA_CENTER.latitude).toBeGreaterThan(GUATEMALA_BOUNDS.minLatitude);
    expect(GUATEMALA_CENTER.longitude).toBeLessThan(GUATEMALA_BOUNDS.maxLongitude);
  });
});
