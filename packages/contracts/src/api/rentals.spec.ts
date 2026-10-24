import {
  confirmRentalRequestSchema,
  counterRentalRequestSchema,
  estimateRentalPrice,
  payRentalRequestSchema,
  rentalEstimateQuerySchema,
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

  it('records a counter rental with a NIT or the final consumer, a name and its price', () => {
    const counter = { ...request, nit: 'cf', clientName: 'Colegio San José', price: 2760 };
    expect(counterRentalRequestSchema.parse(counter)).toMatchObject({
      nit: CONSUMER_NIT,
      clientName: 'Colegio San José',
      email: null,
      price: 2760,
    });
    expect(counterRentalRequestSchema.safeParse({ ...counter, price: undefined }).success).toBe(
      false,
    );
    expect(counterRentalRequestSchema.safeParse({ ...request, nit: 'CF' }).success).toBe(false);
    expect(
      counterRentalRequestSchema.safeParse({ ...counter, returnAt: '2026-10-23T10:00:00.000Z' })
        .success,
    ).toBe(false);
  });

  it('keeps the email given at the counter, or none', () => {
    const counter = { ...request, nit: 'CF', clientName: 'Colegio San José', price: 2760 };
    expect(
      counterRentalRequestSchema.parse({ ...counter, email: 'Reservas@Colegio.edu.gt' }).email,
    ).toBe('reservas@colegio.edu.gt');
    expect(counterRentalRequestSchema.parse({ ...counter, email: null }).email).toBeNull();
    expect(counterRentalRequestSchema.safeParse({ ...counter, email: 'no' }).success).toBe(false);
  });

  it('confirms with a price, may correct the distance, and pays on a chosen day', () => {
    expect(confirmRentalRequestSchema.parse({ price: 2760 })).toEqual({ price: 2760 });
    expect(confirmRentalRequestSchema.parse({ price: 2760, distanceKm: 95 })).toEqual({
      price: 2760,
      distanceKm: 95,
    });
    expect(confirmRentalRequestSchema.safeParse({ price: -1 }).success).toBe(false);
    expect(confirmRentalRequestSchema.safeParse({ price: 10, distanceKm: 0 }).success).toBe(false);
    expect(payRentalRequestSchema.safeParse({ paidOn: '2026-10-21' }).success).toBe(true);
  });

  it('estimates from the distance in the query string', () => {
    expect(rentalEstimateQuerySchema.parse({ distanceKm: '92' })).toEqual({ distanceKm: 92 });
    expect(rentalEstimateQuerySchema.safeParse({ distanceKm: '0' }).success).toBe(false);
    expect(rentalEstimateQuerySchema.safeParse({}).success).toBe(false);
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

  it('estimates the distance times the rate, rounded to the cent', () => {
    expect(estimateRentalPrice(92, 30)).toBe(2760);
    expect(estimateRentalPrice(92.5, 30.25)).toBe(2798.13);
    expect(estimateRentalPrice(0.1, 0.07)).toBe(0.01);
  });
});
