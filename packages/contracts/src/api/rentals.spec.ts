import {
  confirmRentalRequestSchema,
  counterRentalRequestSchema,
  estimateRentalPrice,
  payRentalRequestSchema,
  rentalEstimateQuerySchema,
  rentalListQuerySchema,
  rentalRequestSchema,
} from './rentals';

const CLIENT_ID = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';
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

  it('takes only departments as the places of a counter rental', () => {
    const counter = {
      ...request,
      destinationLabel: 'Sololá',
      clientId: CLIENT_ID,
      price: 2760,
    };
    expect(counterRentalRequestSchema.safeParse(counter).success).toBe(true);
    expect(
      counterRentalRequestSchema.safeParse({ ...counter, destinationLabel: 'Marte' }).success,
    ).toBe(false);
    expect(counterRentalRequestSchema.safeParse({ ...counter, originLabel: 'Marte' }).success).toBe(
      false,
    );
  });

  it('records a counter rental for an existing client, with its price', () => {
    const counter = { ...request, destinationLabel: 'Sololá', clientId: CLIENT_ID, price: 2760 };
    expect(counterRentalRequestSchema.parse(counter)).toMatchObject({
      clientId: CLIENT_ID,
      price: 2760,
    });
    expect(counterRentalRequestSchema.safeParse({ ...counter, price: undefined }).success).toBe(
      false,
    );
    expect(counterRentalRequestSchema.safeParse({ ...request, price: 2760 }).success).toBe(false);
    expect(counterRentalRequestSchema.safeParse({ ...counter, clientId: 'x' }).success).toBe(false);
    expect(
      counterRentalRequestSchema.safeParse({ ...counter, returnAt: '2026-10-23T10:00:00.000Z' })
        .success,
    ).toBe(false);
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
