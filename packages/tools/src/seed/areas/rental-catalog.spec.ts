import { SEED_BRANCHES } from '../catalog';
import { SEED_CLIENTS } from '../clients-catalog';
import { SEED_RENTALS, type RentalTarget } from './rental-catalog';

describe('SEED_RENTALS', () => {
  it('has ten rentals, every one with a different key', () => {
    expect(SEED_RENTALS).toHaveLength(10);
    expect(new Set(SEED_RENTALS.map((rental) => rental.key)).size).toBe(10);
  });

  it('reaches every state a rental can end in', () => {
    const targets = new Set<RentalTarget>(SEED_RENTALS.map((rental) => rental.target));
    expect(targets).toEqual(
      new Set<RentalTarget>([
        'REQUESTED',
        'CONFIRMED',
        'PAID',
        'ASSIGNED',
        'CANCELLED_AFTER_PAYMENT',
        'CANCELLED',
      ]),
    );
  });

  it('leaves later than the regular trips, which go out for the first seven days', () => {
    for (const rental of SEED_RENTALS) expect(rental.daysAhead).toBeGreaterThanOrEqual(8);
  });

  it('asks for a bus that exists: a branch of the seed, and no more people than the smallest bus', () => {
    const branches = SEED_BRANCHES.map((branch) => branch.code);
    for (const rental of SEED_RENTALS) {
      expect(branches).toContain(rental.branch);
      expect(rental.passengers).toBeGreaterThan(0);
      expect(rental.passengers).toBeLessThanOrEqual(40);
      expect(rental.distanceKm).toBeGreaterThanOrEqual(10);
      expect(rental.returnsAfterHours).toBeGreaterThan(0);
    }
  });

  it('is asked for by a client of the catalog online and by a name at the counter', () => {
    const numbers = SEED_CLIENTS.map((client) => client.number);
    for (const rental of SEED_RENTALS) {
      if (rental.channel === 'ONLINE') {
        expect(numbers).toContain(rental.client);
      } else {
        expect(rental.walkIn?.clientName.length).toBeGreaterThan(1);
        expect(rental.walkIn?.nit).toMatch(/^\d{1,12}[\dK]$/);
      }
    }
  });

  it('never asks one client for the same trip twice, so the trip identifies the rental', () => {
    const keys = SEED_RENTALS.map(
      (rental) =>
        `${rental.channel === 'ONLINE' ? rental.client : rental.walkIn?.clientName}|${rental.origin}|${rental.destination}|${rental.passengers}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps a counter rental at the counter: nothing to cancel before paying there', () => {
    for (const rental of SEED_RENTALS.filter((r) => r.channel === 'COUNTER')) {
      expect(['CONFIRMED', 'PAID', 'ASSIGNED']).toContain(rental.target);
    }
  });
});
