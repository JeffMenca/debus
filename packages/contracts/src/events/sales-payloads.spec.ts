import {
  SALES_EXAMPLES,
  SALES_PAYLOAD_SCHEMAS,
  exampleCounterTicketSold,
  exampleRefundRequested,
  exampleTicketSold,
} from './sales-examples';
import { refundRequestedPayloadSchema, ticketSoldPayloadSchema } from './sales-payloads';

describe('sales events', () => {
  it.each(Object.entries(SALES_EXAMPLES))('the %s example fits its schema', (type, payload) => {
    expect(
      SALES_PAYLOAD_SCHEMAS[type as keyof typeof SALES_PAYLOAD_SCHEMAS].parse(payload),
    ).toEqual(payload);
  });

  it('charges exactly the unit price for every seat', () => {
    expect(ticketSoldPayloadSchema.safeParse({ ...exampleTicketSold, total: 171 }).success).toBe(
      false,
    );
    expect(
      ticketSoldPayloadSchema.safeParse({
        ...exampleTicketSold,
        seats: [1, 2, 3],
        unitPrice: 33.33,
        total: 99.99,
      }).success,
    ).toBe(true);
  });

  it('never sells the same seat twice in one ticket', () => {
    expect(ticketSoldPayloadSchema.safeParse({ ...exampleTicketSold, seats: [7, 7] }).success).toBe(
      false,
    );
  });

  it('needs the client and the email of an online purchase', () => {
    expect(
      ticketSoldPayloadSchema.safeParse({ ...exampleTicketSold, clientId: null }).success,
    ).toBe(false);
    expect(ticketSoldPayloadSchema.safeParse({ ...exampleTicketSold, email: null }).success).toBe(
      false,
    );
  });

  it('sells at the counter to the final consumer without account or email', () => {
    expect(ticketSoldPayloadSchema.parse(exampleCounterTicketSold)).toMatchObject({
      channel: 'COUNTER',
      clientId: null,
      email: null,
      nit: 'CF',
    });
  });

  it('refunds only to a wallet, the amount of the ticket', () => {
    expect(
      refundRequestedPayloadSchema.safeParse({ ...exampleRefundRequested, clientId: null }).success,
    ).toBe(false);
    expect(exampleRefundRequested.amount).toBe(exampleTicketSold.total);
    expect(
      refundRequestedPayloadSchema.safeParse({ ...exampleRefundRequested, reason: 'OTHER' })
        .success,
    ).toBe(false);
  });
});
