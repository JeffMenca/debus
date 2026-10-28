import {
  type AvailableTripListQuery,
  exampleTripScheduled,
  refundRequestedPayloadSchema,
} from '@debus/contracts';
import {
  closedForSale,
  isOnSale,
  onSale,
  onSaleConditions,
  toRefundRequested,
  toTripRow,
} from './trip-rules';

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

describe('onSale', () => {
  it('keeps the trips whose hour is ahead and that have no departure mark', () => {
    const sql = onSale(now);

    expect(sql.sql).toBe(
      't.departure_at > ? AND NOT EXISTS (SELECT 1 FROM departed_trips d WHERE d.trip_id = t.trip_id)',
    );
    expect(sql.values).toEqual([now]);
  });
});

describe('closedForSale', () => {
  it('closes the sale at the scheduled departure, even if the bus is late', () => {
    expect(closedForSale(new Date('2026-10-16T12:00:00.000Z'), false, now)).toBe(true);
    expect(closedForSale(new Date('2026-10-16T11:59:00.000Z'), false, now)).toBe(true);
  });

  it('closes the sale as soon as the bus leaves, before its scheduled hour', () => {
    expect(closedForSale(new Date('2026-10-16T14:00:00.000Z'), true, now)).toBe(true);
  });

  it('keeps the sale open for a trip that has not left and is not due', () => {
    expect(closedForSale(new Date('2026-10-16T12:01:00.000Z'), false, now)).toBe(false);
  });
});

describe('onSaleConditions', () => {
  const conditions = (overrides: Partial<AvailableTripListQuery> = {}, branchId?: string) =>
    onSaleConditions({ ...query, ...overrides }, now, branchId);

  it('only lists trips that have not left yet, by the clock or by the bus', () => {
    const sql = conditions();

    expect(sql.sql).toBe(onSale(now).sql);
    expect(sql.values).toEqual([now]);
  });

  it('narrows the list to the trips leaving from one branch', () => {
    const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
    const sql = conditions({}, branchId);

    expect(sql.sql).toContain('t.branch_id = ?::uuid');
    expect(sql.values).toEqual([now, branchId]);
  });

  it('limits the departure to whole Guatemalan days', () => {
    const sql = conditions({ from: '2026-10-20', to: '2026-10-21' });

    expect(sql.sql).toContain('t.departure_at >= ?');
    expect(sql.sql).toContain('t.departure_at < ?');
    expect(sql.values).toEqual([
      now,
      new Date('2026-10-20T06:00:00.000Z'),
      new Date('2026-10-22T06:00:00.000Z'),
    ]);
  });

  it('matches the origin and the destination exactly, as the places list them', () => {
    const sql = conditions({ origin: 'Quetzaltenango', destination: 'Guatemala' });

    expect(sql.sql).toContain('t.origin_label = ?');
    expect(sql.sql).toContain('t.destination_label = ?');
    expect(sql.values).toEqual([now, 'Quetzaltenango', 'Guatemala']);
  });

  it('searches the folded text with LIKE wildcards taken literally', () => {
    const sql = conditions({ q: '100%' });

    expect(sql.sql).toContain('t.search_text LIKE ?');
    expect(sql.values).toEqual([now, '%100\\%%']);
  });

  it('asks for room for every passenger', () => {
    const sql = conditions({ seats: 3 });

    expect(sql.sql).toContain('t.capacity - COALESCE(s.taken, 0) >= ?');
    expect(sql.values).toEqual([now, 3]);
  });

  it('joins every filter with AND', () => {
    const sql = conditions({ origin: 'Xela', seats: 2 });

    expect(sql.sql.split(' AND ')).toHaveLength(4);
  });
});

describe('toRefundRequested', () => {
  const row = {
    id: '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b',
    client_id: '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a',
    seats: [4, 3],
    amount: 170,
    nit: '45218376',
    origin_label: 'Quetzaltenango',
    destination_label: 'Guatemala',
    departure_at: new Date('2026-10-20T11:30:00.000Z'),
  };

  it('asks to give back what the purchase charged, for the deleted trip', () => {
    const payload = toRefundRequested(row, exampleTripScheduled.tripId, '2026-10-19T09:00:00.000Z');

    expect(refundRequestedPayloadSchema.parse(payload)).toEqual({
      ticketId: row.id,
      tripId: exampleTripScheduled.tripId,
      clientId: row.client_id,
      nit: '45218376',
      seats: [3, 4],
      amount: 170,
      reason: 'TRIP_DELETED',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      departureAt: '2026-10-20T11:30:00.000Z',
      requestedAt: '2026-10-19T09:00:00.000Z',
    });
  });
});
