import { type AvailableTripListQuery, exampleTripScheduled } from '@debus/contracts';
import { isOnSale, onSaleConditions, toTripRow } from './trip-rules';

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

describe('onSaleConditions', () => {
  const conditions = (overrides: Partial<AvailableTripListQuery> = {}, branchId?: string) =>
    onSaleConditions({ ...query, ...overrides }, now, branchId);

  it('only lists trips that have not left yet', () => {
    const sql = conditions();

    expect(sql.sql).toBe('t.departure_at > ?');
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

    expect(sql.sql.split(' AND ')).toHaveLength(3);
  });
});
