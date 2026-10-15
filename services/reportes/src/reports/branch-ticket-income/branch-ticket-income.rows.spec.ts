import {
  routeName,
  toTicketIncomeGroups,
  toTicketIncomeRow,
  toTicketIncomeTotals,
} from './branch-ticket-income.rows';

describe('ticket income rows', () => {
  const record = {
    trip_id: '1f0e2d3c-4b5a-4968-8776-655443322110',
    departure_at: new Date('2026-10-20T11:30:00.000Z'),
    route_id: 'a1000000-4b5a-4968-8776-655443322110',
    origin_label: 'Quetzaltenango',
    destination_label: 'Guatemala',
    bus_id: 'b1000000-4b5a-4968-8776-655443322110',
    bus_plate: 'C482BTX',
    tickets: 3,
    online_tickets: 2,
    counter_tickets: 1,
    income: 255,
  };

  it('writes the route as origin and destination with a dash the PDF font can print', () => {
    expect(routeName('Quetzaltenango', 'Antigua Guatemala')).toBe(
      'Quetzaltenango – Antigua Guatemala',
    );
  });

  it('maps a raw row to the contract row with the departure as an ISO instant', () => {
    expect(toTicketIncomeRow(record)).toEqual({
      tripId: record.trip_id,
      departureAt: '2026-10-20T11:30:00.000Z',
      routeId: record.route_id,
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      busId: record.bus_id,
      busPlate: 'C482BTX',
      tickets: 3,
      onlineTickets: 2,
      counterTickets: 1,
      income: 255,
    });
  });

  it('keeps an unknown bus plate as null', () => {
    expect(toTicketIncomeRow({ ...record, bus_plate: null }).busPlate).toBeNull();
  });

  it('maps the groups of the routes in the order they come', () => {
    expect(
      toTicketIncomeGroups([
        {
          route_id: record.route_id,
          origin_label: 'Quetzaltenango',
          destination_label: 'Guatemala',
          tickets: 3,
          income: 255,
        },
      ]),
    ).toEqual([
      {
        routeId: record.route_id,
        originLabel: 'Quetzaltenango',
        destinationLabel: 'Guatemala',
        tickets: 3,
        income: 255,
      },
    ]);
  });

  it('turns the totals into zeros when nothing matched', () => {
    expect(toTicketIncomeTotals(undefined)).toEqual({ trips: 0, tickets: 0, income: 0 });
    expect(toTicketIncomeTotals({ trips: 2, tickets: 6, income: 555 })).toEqual({
      trips: 2,
      tickets: 6,
      income: 555,
    });
  });
});
