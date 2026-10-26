import { guatemalaDateTime, type AvailableTrip } from '@debus/contracts';
import { SEED_BRANCHES, SEED_ROUTES } from '../catalog';
import { addDays } from '../dates';
import { uuidFrom } from '../ids';
import {
  COUNTER_FIRST_SEAT,
  ONLINE_FIRST_SEAT,
  ROUTE_DEMAND,
  SALE_FROM_DAYS_AHEAD,
  planSales,
} from './sales-plan';

const TODAY = '2026-10-26';
const nameOf = (code: string) => SEED_BRANCHES.find((branch) => branch.code === code)!.name;

// Two trips a day on every route for the next seven days, as the operation of the day leaves them.
function trips(capacity = 44): AvailableTrip[] {
  const list: AvailableTrip[] = [];
  for (let ahead = 1; ahead <= 7; ahead++) {
    for (const time of ['06:00', '14:00']) {
      for (const route of SEED_ROUTES) {
        const departureAt = guatemalaDateTime(addDays(TODAY, ahead), time);
        const tripId = uuidFrom(`trip:${route.from}:${route.to}:${departureAt}`);
        list.push({
          tripId,
          routeId: uuidFrom(`route:${route.from}:${route.to}`),
          branchId: uuidFrom(`branch:${route.from}`),
          originLabel: nameOf(route.from),
          destinationLabel: nameOf(route.to),
          departureAt,
          estimatedArrivalAt: departureAt,
          ticketPrice: route.ticketPrice,
          busPlate: 'C100BTX',
          capacity,
          freeSeats: capacity,
        });
      }
    }
  }
  return list;
}

const plan = (list = trips()) => planSales(list, { today: TODAY });
const online = (list = trips()) => plan(list).filter((sale) => sale.channel === 'ONLINE');
const counter = (list = trips()) => plan(list).filter((sale) => sale.channel === 'COUNTER');
const dayOf = (iso: string) => new Date(Date.parse(iso) - 6 * 3_600_000).toISOString().slice(0, 10);

describe('planSales', () => {
  it('gives the same plan every time, whatever the order the trips come in', () => {
    const list = trips();
    expect(plan(list)).toEqual(plan([...list].reverse()));
  });

  it('sells only trips that leave from the fourth day on, so the next load does not delete them', () => {
    expect(SALE_FROM_DAYS_AHEAD).toBe(4);
    const days = new Set(plan().map((sale) => dayOf(sale.trip.departureAt)));
    expect([...days].sort()).toEqual([
      addDays(TODAY, 4),
      addDays(TODAY, 5),
      addDays(TODAY, 6),
      addDays(TODAY, 7),
    ]);
  });

  it('sells about a quarter of the trips in each channel', () => {
    expect(online().length).toBeGreaterThanOrEqual(15);
    expect(online().length).toBeLessThanOrEqual(40);
    expect(counter().length).toBeGreaterThanOrEqual(15);
    expect(counter().length).toBeLessThanOrEqual(40);
  });

  it('sells the routes people ask for most more often', () => {
    const sold = (from: string, to: string) =>
      plan().filter(
        (sale) =>
          sale.trip.originLabel === nameOf(from) && sale.trip.destinationLabel === nameOf(to),
      ).length;
    expect(ROUTE_DEMAND['GUA-ANT']).toBeGreaterThan(ROUTE_DEMAND['GUA-FLO'] ?? 0);
    expect(sold('GUA', 'ANT') + sold('ANT', 'GUA')).toBeGreaterThan(
      sold('GUA', 'FLO') + sold('FLO', 'GUA'),
    );
  });

  it('asks for one to three seats, in a block of its own for each channel', () => {
    for (const sale of plan()) {
      expect(sale.seats.length).toBeGreaterThanOrEqual(1);
      expect(sale.seats.length).toBeLessThanOrEqual(3);
      const first = sale.channel === 'ONLINE' ? ONLINE_FIRST_SEAT : COUNTER_FIRST_SEAT;
      expect(sale.seats).toEqual(sale.seats.map((_, index) => first + index));
    }
  });

  it('never repeats a seat in a trip, even when both channels sell it', () => {
    const taken = new Map<string, number[]>();
    for (const sale of plan()) {
      const seats = taken.get(sale.trip.tripId) ?? [];
      for (const seat of sale.seats) expect(seats).not.toContain(seat);
      taken.set(sale.trip.tripId, [...seats, ...sale.seats]);
    }
  });

  it('gives each sale an id of its own that depends on the trip and the channel', () => {
    const ids = plan().map((sale) => sale.ticketId);
    expect(new Set(ids).size).toBe(ids.length);
    const first = plan()[0]!;
    expect(first.ticketId).toBe(
      uuidFrom(`ticket:${first.channel === 'ONLINE' ? 'online' : 'counter'}:${first.trip.tripId}`),
    );
  });

  it('never asks for a seat the bus does not have', () => {
    const small = plan(trips(22));
    expect(small.length).toBeGreaterThan(0);
    for (const sale of small) expect(Math.max(...sale.seats)).toBeLessThanOrEqual(22);
    expect(plan(trips(2)).every((sale) => sale.channel === 'ONLINE')).toBe(true);
  });

  it('chooses a client for each online sale and a buyer for each counter sale', () => {
    for (const sale of online()) {
      expect(sale.buyer).toEqual({ kind: 'client', number: expect.any(Number) });
    }
    const buyers = counter().map((sale) => sale.buyer.kind);
    expect(buyers).toContain('client');
    expect(buyers).toContain('walk-in');
    expect(buyers.filter((kind) => kind === 'client').length).toBeLessThan(counter().length / 2);
  });

  it('puts an email on a few walk-in sales so the notice shows', () => {
    const withEmail = counter().filter(
      (sale) => sale.buyer.kind === 'walk-in' && sale.buyer.withEmail,
    );
    expect(withEmail.length).toBeGreaterThanOrEqual(1);
    expect(withEmail.length).toBeLessThan(counter().length / 3);
  });

  it('plans nothing without trips', () => {
    expect(plan([])).toEqual([]);
  });
});
