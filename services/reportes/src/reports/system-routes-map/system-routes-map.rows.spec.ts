import { selectedBranchOf, toMapBranch, toMapRoute } from './system-routes-map.rows';

describe('system routes map rows', () => {
  const branches = [
    { id: 'b1', name: 'Ángeles', latitude: 14.8, longitude: -91.5, routes: 0 },
    { id: 'b2', name: 'Boca', latitude: 14.6, longitude: -90.5, routes: 2 },
    { id: 'b3', name: 'Cumbre', latitude: 15.1, longitude: -90.3, routes: 1 },
  ];

  it('maps a raw branch to the contract branch', () => {
    expect(
      toMapBranch({
        id: 'b1',
        name: 'Ángeles',
        latitude: 14.8,
        longitude: -91.5,
        routes: 3,
      }),
    ).toEqual({ id: 'b1', name: 'Ángeles', latitude: 14.8, longitude: -91.5, routes: 3 });
  });

  it('maps a raw route to the contract route', () => {
    expect(
      toMapRoute({
        route_id: 'r1',
        destination_branch_id: 'b3',
        destination_name: 'Cumbre',
        latitude: 15.1,
        longitude: -90.3,
        distance_km: 201.5,
        ticket_price: 85,
        tickets: 12,
      }),
    ).toEqual({
      routeId: 'r1',
      destinationBranchId: 'b3',
      destinationName: 'Cumbre',
      latitude: 15.1,
      longitude: -90.3,
      distanceKm: 201.5,
      ticketPrice: 85,
      tickets: 12,
    });
  });

  it('keeps the branch that was asked for, even when it has no routes', () => {
    expect(selectedBranchOf(branches, 'b1')).toBe('b1');
    expect(selectedBranchOf(branches, 'unknown')).toBe('unknown');
  });

  it('picks the first branch with active routes when none is asked for', () => {
    expect(selectedBranchOf(branches, undefined)).toBe('b2');
  });

  it('picks nothing when no branch has active routes', () => {
    expect(selectedBranchOf([branches[0]!], undefined)).toBeNull();
    expect(selectedBranchOf([], undefined)).toBeNull();
  });
});
