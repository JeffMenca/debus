import {
  confirmRentalRequestSchema,
  counterRentalRequestSchema,
  payRentalRequestSchema,
  rentalListQuerySchema,
  rentalRequestSchema,
} from './rentals';
import { CONSUMER_NIT } from './tickets';

const request = {
  branchId: '9b2c7a10-1111-4c4c-8888-123456789abc',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Panajachel',
  departureAt: '2026-10-24T13:00:00.000Z',
  returnAt: '2026-10-24T23:00:00.000Z',
  passengers: 35,
  distanceKm: 92,
};

describe('rental contracts', () => {
  it('asks for the trip, the passengers and the distance', () => {
    expect(rentalRequestSchema.parse(request)).toEqual(request);
    expect(rentalRequestSchema.safeParse({ ...request, passengers: 0 }).success).toBe(false);
    expect(rentalRequestSchema.safeParse({ ...request, distanceKm: 0 }).success).toBe(false);
  });

  it('allows a one-way rental but never a return before the departure', () => {
    expect(rentalRequestSchema.safeParse({ ...request, returnAt: null }).success).toBe(true);
    expect(
      rentalRequestSchema.safeParse({ ...request, returnAt: '2026-10-24T13:00:00Z' }).success,
    ).toBe(false);
  });

  it('records a counter rental with a NIT or the final consumer and a name', () => {
    expect(
      counterRentalRequestSchema.parse({ ...request, nit: 'cf', clientName: 'Colegio San José' }),
    ).toMatchObject({ nit: CONSUMER_NIT, clientName: 'Colegio San José' });
    expect(counterRentalRequestSchema.safeParse({ ...request, nit: 'CF' }).success).toBe(false);
    expect(
      counterRentalRequestSchema.safeParse({
        ...request,
        nit: 'CF',
        clientName: 'Colegio San José',
        returnAt: '2026-10-23T10:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('confirms with a price and pays on a chosen day', () => {
    expect(confirmRentalRequestSchema.safeParse({ price: 2760 }).success).toBe(true);
    expect(confirmRentalRequestSchema.safeParse({ price: -1 }).success).toBe(false);
    expect(payRentalRequestSchema.safeParse({ paidOn: '2026-10-21' }).success).toBe(true);
  });

  it('filters by status and range, paged', () => {
    expect(rentalListQuerySchema.parse({})).toEqual({ status: 'all', page: 1, pageSize: 20 });
    expect(rentalListQuerySchema.parse({ status: 'CONFIRMED', q: 'Colegio' })).toMatchObject({
      status: 'CONFIRMED',
      q: 'colegio',
    });
    expect(rentalListQuerySchema.safeParse({ status: 'LOST' }).success).toBe(false);
    expect(rentalListQuerySchema.safeParse({ from: '2026-10-14', to: '2026-10-13' }).success).toBe(
      false,
    );
  });
});
