import {
  CONSUMER_NIT,
  availableTripListQuerySchema,
  PURCHASE_FAILURES,
  PURCHASE_STATUSES,
  SEAT_SELECTION_MAX,
  counterSaleRequestSchema,
  purchaseSchema,
  purchaseTicketRequestSchema,
  saleNitSchema,
  seatSelectionSchema,
  ticketListQuerySchema,
  ticketPageSchema,
  tripPlacesSchema,
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

  it('narrows the trips on sale by exact origin and destination and by free seats', () => {
    expect(
      availableTripListQuerySchema.parse({
        origin: ' Quetzaltenango ',
        destination: 'Ciudad de Guatemala',
        seats: '3',
      }),
    ).toMatchObject({ origin: 'Quetzaltenango', destination: 'Ciudad de Guatemala', seats: 3 });
    expect(availableTripListQuerySchema.safeParse({ seats: '0' }).success).toBe(false);
    expect(availableTripListQuerySchema.safeParse({ seats: '11' }).success).toBe(false);
    expect(availableTripListQuerySchema.safeParse({ origin: '  ' }).success).toBe(false);
    expect(availableTripListQuerySchema.safeParse({ destination: 'x'.repeat(121) }).success).toBe(
      false,
    );
  });

  it('caps a selection and the passengers of a search at the same number of seats', () => {
    expect(SEAT_SELECTION_MAX).toBe(10);
    expect(availableTripListQuerySchema.parse({ seats: SEAT_SELECTION_MAX }).seats).toBe(10);
  });

  it('lists the places with trips on sale, where they leave from and where they go', () => {
    const places = { origins: ['Quetzaltenango'], destinations: ['Flores', 'Guatemala'] };
    expect(tripPlacesSchema.parse(places)).toEqual(places);
    expect(tripPlacesSchema.safeParse({ origins: [] }).success).toBe(false);
  });

  it('pages the ticket history with the same range rule', () => {
    expect(ticketListQuerySchema.parse({ page: '2' })).toEqual({ page: 2, pageSize: 20 });
    expect(ticketListQuerySchema.safeParse({ from: '2026-10-14', to: '2026-10-13' }).success).toBe(
      false,
    );
  });
});

describe('purchase contract', () => {
  const ticket = {
    id: '9f8e7d6c-5b4a-4f3e-8d2c-1b0a9f8e7d6c',
    status: 'CONFIRMED',
    channel: 'ONLINE',
    tripId,
    originLabel: 'Quetzaltenango',
    destinationLabel: 'Guatemala',
    departureAt: '2026-10-20T12:00:00.000Z',
    busPlate: 'C482BTX',
    seats: [3, 4],
    unitPrice: 85,
    total: 170,
    nit: 'CF',
    buyerName: 'Ana López',
    paidOn: '2026-10-19',
    soldAt: '2026-10-19T16:30:00.000Z',
  };
  const base = {
    ticketId: ticket.id,
    tripId,
    seats: [3, 4],
    amount: 170,
    paidOn: '2026-10-19',
  };

  it('lists the states and the reasons a purchase can end', () => {
    expect(PURCHASE_STATUSES).toEqual(['PENDING', 'CONFIRMED', 'FAILED']);
    expect(PURCHASE_FAILURES).toEqual([
      'INSUFFICIENT_BALANCE',
      'PAYMENT_EXPIRED',
      'WALLET_NOT_READY',
      'WALLET_UNAVAILABLE',
      'PAYMENT_REJECTED',
      'TRIP_CANCELLED',
    ]);
  });

  it('carries the ticket of a confirmed purchase and nothing about a failure', () => {
    const confirmed = { ...base, status: 'CONFIRMED', failure: null, message: null, ticket };

    expect(purchaseSchema.parse(confirmed)).toEqual(confirmed);
    expect(purchaseSchema.safeParse({ ...confirmed, ticket: null }).success).toBe(false);
    expect(purchaseSchema.safeParse({ ...confirmed, failure: 'PAYMENT_EXPIRED' }).success).toBe(
      false,
    );
  });

  it('explains a failed purchase with its reason and its text, and has no ticket', () => {
    const failed = {
      ...base,
      status: 'FAILED',
      failure: 'INSUFFICIENT_BALANCE',
      message: 'No tienes saldo suficiente.',
      ticket: null,
    };

    expect(purchaseSchema.parse(failed)).toEqual(failed);
    expect(purchaseSchema.safeParse({ ...failed, failure: null }).success).toBe(false);
    expect(purchaseSchema.safeParse({ ...failed, message: null }).success).toBe(false);
    expect(purchaseSchema.safeParse({ ...failed, ticket }).success).toBe(false);
  });

  it('pages the ticket history with the next trip of the client, or none', () => {
    const page = { items: [ticket], total: 1, page: 1, pageSize: 20 };

    expect(ticketPageSchema.parse({ ...page, summary: { next: ticket } })).toMatchObject(page);
    expect(ticketPageSchema.parse({ ...page, summary: { next: null } }).summary.next).toBeNull();
    expect(ticketPageSchema.safeParse(page).success).toBe(false);
  });

  it('tells a pending purchase apart: a text, no reason and no ticket yet', () => {
    const pending = {
      ...base,
      status: 'PENDING',
      failure: null,
      message: 'Estamos confirmando el pago.',
      ticket: null,
    };

    expect(purchaseSchema.parse(pending)).toEqual(pending);
    expect(purchaseSchema.safeParse({ ...pending, message: null }).success).toBe(false);
    expect(purchaseSchema.safeParse({ ...pending, failure: 'PAYMENT_EXPIRED' }).success).toBe(
      false,
    );
    expect(purchaseSchema.safeParse({ ...pending, ticket }).success).toBe(false);
  });
});
