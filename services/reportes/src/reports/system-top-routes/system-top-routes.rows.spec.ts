import { shareOf, toTopRouteRow, toTopRoutesTotals } from './system-top-routes.rows';

describe('system top routes rows', () => {
  const record = {
    position: 1,
    route_id: '3b2c1d0e-6f5a-4b4c-9d8e-7f6a5b4c3d2e',
    branch_id: '9b2c7a10-1111-4c4c-8888-123456789abc',
    origin_label: 'Quetzaltenango',
    destination_label: 'Guatemala',
    distance_km: 201.5 as number | null,
    ticket_price: 85 as number | null,
    active: true as boolean | null,
    trips: 2,
    online_tickets: 3,
    counter_tickets: 1,
    tickets: 4,
    income: 340,
  };

  it('gives the share of the tickets of the report with one decimal', () => {
    expect(shareOf(1, 3)).toBe(33.3);
    expect(shareOf(2, 3)).toBe(66.7);
    expect(shareOf(4, 4)).toBe(100);
  });

  it('has no share when no ticket was sold', () => {
    expect(shareOf(0, 0)).toBe(0);
  });

  it('maps a raw route to the contract row with its position and share', () => {
    expect(toTopRouteRow(record, 16)).toEqual({
      position: 1,
      routeId: record.route_id,
      branchId: record.branch_id,
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      distanceKm: 201.5,
      ticketPrice: 85,
      active: true,
      trips: 2,
      onlineTickets: 3,
      counterTickets: 1,
      tickets: 4,
      income: 340,
      share: 25,
    });
  });

  it('keeps the distance, the price and the state as null while the route has not arrived', () => {
    expect(
      toTopRouteRow({ ...record, distance_km: null, ticket_price: null, active: null }, 4),
    ).toMatchObject({ distanceKm: null, ticketPrice: null, active: null, share: 100 });
  });

  it('turns the totals into zeros when nothing matched', () => {
    expect(toTopRoutesTotals(undefined)).toEqual({ routes: 0, trips: 0, tickets: 0, income: 0 });
    expect(toTopRoutesTotals({ routes: 2, trips: 3, tickets: 16, income: 1360 })).toEqual({
      routes: 2,
      trips: 3,
      tickets: 16,
      income: 1360,
    });
  });
});
