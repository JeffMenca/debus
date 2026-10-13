import { canDeleteRoute, isValidDestination } from './route-rules';

describe('route rules', () => {
  it('goes from the admin branch to another active branch', () => {
    expect(isValidDestination('o', { id: 'd', active: true })).toBe(true);
    expect(isValidDestination('o', { id: 'o', active: true })).toBe(false);
    expect(isValidDestination('o', { id: 'd', active: false })).toBe(false);
    expect(isValidDestination('o', null)).toBe(false);
  });

  it('deletes only a route that never had trips', () => {
    expect(canDeleteRoute({ hasTrips: false })).toBe(true);
    expect(canDeleteRoute({ hasTrips: true })).toBe(false);
  });
});
