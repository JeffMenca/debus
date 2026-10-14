import {
  CONSUMER_NIT,
  availableTripListQuerySchema,
  counterSaleRequestSchema,
  purchaseTicketRequestSchema,
  saleNitSchema,
  seatSelectionSchema,
  ticketListQuerySchema,
} from './tickets';

const tripId = '4c3d2e1f-7a6b-4c5d-8e9f-0a1b2c3d4e5f';

describe('ticket contracts', () => {
  it('accepts the final consumer or a real NIT, normalized', () => {
    expect(saleNitSchema.parse(' cf ')).toBe(CONSUMER_NIT);
    expect(saleNitSchema.parse('1234567-k')).toBe('1234567K');
    expect(saleNitSchema.safeParse('CF1').success).toBe(false);
    expect(saleNitSchema.safeParse('').success).toBe(false);
  });

  it('takes between one and ten different seats within a bus', () => {
    expect(seatSelectionSchema.parse([3, 4])).toEqual([3, 4]);
    expect(seatSelectionSchema.safeParse([]).success).toBe(false);
    expect(seatSelectionSchema.safeParse([4, 4]).success).toBe(false);
    expect(seatSelectionSchema.safeParse([0]).success).toBe(false);
    expect(seatSelectionSchema.safeParse([81]).success).toBe(false);
    expect(seatSelectionSchema.safeParse([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).success).toBe(false);
  });

  it('needs the trip, the seats and the payment day to buy online', () => {
    const purchase = { tripId, seats: [12], paidOn: '2026-10-13' };
    expect(purchaseTicketRequestSchema.parse(purchase)).toEqual(purchase);
    expect(
      purchaseTicketRequestSchema.safeParse({ ...purchase, paidOn: '13/10/2026' }).success,
    ).toBe(false);
  });

  it('sells at the counter to the final consumer when no NIT is given', () => {
    const sale = counterSaleRequestSchema.parse({ tripId, seats: [1], paidOn: '2026-10-13' });
    expect(sale.nit).toBe(CONSUMER_NIT);
    expect(
      counterSaleRequestSchema.safeParse({
        tripId,
        seats: [1],
        paidOn: '2026-10-13',
        email: 'not-an-email',
      }).success,
    ).toBe(false);
    expect(
      counterSaleRequestSchema.parse({
        tripId,
        seats: [1],
        paidOn: '2026-10-13',
        nit: '1234567-8',
        buyerName: ' Ana López ',
        email: ' ANA@debus.test ',
      }),
    ).toMatchObject({ nit: '12345678', buyerName: 'Ana López', email: 'ana@debus.test' });
  });

  it('pages the available trips and never lets the range go backwards', () => {
    expect(availableTripListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(
      availableTripListQuerySchema.safeParse({ from: '2026-10-14', to: '2026-10-13' }).success,
    ).toBe(false);
    expect(availableTripListQuerySchema.parse({ q: 'Quetzaltenango' }).q).toBe('quetzaltenango');
  });

  it('pages the ticket history with the same range rule', () => {
    expect(ticketListQuerySchema.parse({ page: '2' })).toEqual({ page: 2, pageSize: 20 });
    expect(ticketListQuerySchema.safeParse({ from: '2026-10-14', to: '2026-10-13' }).success).toBe(
      false,
    );
  });
});
