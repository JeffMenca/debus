import { exampleTripScheduled } from '@debus/contracts';
import { isOnSale, onSaleWhere, toTripRow } from './trip-rules';

const now = new Date('2026-10-16T12:00:00.000Z');
const query = { page: 1, pageSize: 20 };

describe('isOnSale', () => {
  it('sells the seats of a regular trip with a price', () => {
    expect(isOnSale(exampleTripScheduled)).toBe(true);
  });

  it('leaves out a rental, which has no ticket price', () => {
    expect(
      isOnSale({ ...exampleTripScheduled, type: 'RENTAL', ticketPrice: null, routeId: null }),
    ).toBe(false);
  });

  it('leaves out a regular trip that came without a price or a route', () => {
    expect(isOnSale({ ...exampleTripScheduled, ticketPrice: null })).toBe(false);
    expect(isOnSale({ ...exampleTripScheduled, routeId: null })).toBe(false);
  });
});

describe('toTripRow', () => {
  it('keeps what a sale needs and an accent-free search text', () => {
    const row = toTripRow({
      ...exampleTripScheduled,
      routeId: String(exampleTripScheduled.routeId),
      ticketPrice: 85,
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Petén',
    });

    expect(row).toEqual({
      tripId: exampleTripScheduled.tripId,
      branchId: exampleTripScheduled.branchId,
      routeId: exampleTripScheduled.routeId,
      busId: exampleTripScheduled.busId,
      busPlate: 'C482BTX',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Petén',
      capacity: 40,
      ticketPrice: 85,
      departureAt: exampleTripScheduled.departureAt,
      estimatedArrivalAt: exampleTripScheduled.estimatedArrivalAt,
      searchText: 'quetzaltenango peten c482btx',
    });
  });
});

describe('onSaleWhere', () => {
  it('only lists trips that have not left yet', () => {
    expect(onSaleWhere(query, now)).toEqual({ departureAt: { gt: now } });
  });

  it('limits the departure to whole Guatemalan days', () => {
    expect(onSaleWhere({ ...query, from: '2026-10-20', to: '2026-10-21' }, now)).toEqual({
      departureAt: {
        gt: now,
        gte: new Date('2026-10-20T06:00:00.000Z'),
        lt: new Date('2026-10-22T06:00:00.000Z'),
      },
    });
  });

  it('searches the folded text with LIKE wildcards taken literally', () => {
    expect(onSaleWhere({ ...query, q: '100%' }, now)).toEqual({
      departureAt: { gt: now },
      searchText: { contains: '100\\%' },
    });
  });
});
