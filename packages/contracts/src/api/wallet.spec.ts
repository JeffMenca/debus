import {
  WALLET_DEBIT_PATH,
  topUpRequestSchema,
  walletDebitRequestSchema,
  walletDebitSchema,
  walletMovementListQuerySchema,
} from './wallet';

const debit = {
  clientId: '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a',
  amount: 170,
  kind: 'TICKET',
  reference: '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b',
  description: 'Boleto Quetzaltenango - Guatemala',
  occurredOn: '2026-10-13',
};

describe('wallet contracts', () => {
  it('tops up a positive amount with at most two decimals on a chosen day', () => {
    expect(topUpRequestSchema.parse({ amount: 150.5, paidOn: '2026-10-13' })).toEqual({
      amount: 150.5,
      paidOn: '2026-10-13',
    });
    expect(topUpRequestSchema.safeParse({ amount: 0, paidOn: '2026-10-13' }).success).toBe(false);
    expect(topUpRequestSchema.safeParse({ amount: 10.555, paidOn: '2026-10-13' }).success).toBe(
      false,
    );
    expect(topUpRequestSchema.safeParse({ amount: 10 }).success).toBe(false);
  });

  it('debits only what references the ticket or rental it pays', () => {
    expect(walletDebitRequestSchema.parse(debit)).toEqual(debit);
    expect(walletDebitRequestSchema.safeParse({ ...debit, reference: undefined }).success).toBe(
      false,
    );
    expect(walletDebitRequestSchema.safeParse({ ...debit, kind: 'TOP_UP' }).success).toBe(false);
    expect(WALLET_DEBIT_PATH.startsWith('/internal/')).toBe(true);
  });

  it('filters the movements by kind and range, paged', () => {
    expect(walletMovementListQuerySchema.parse({})).toEqual({
      kind: 'all',
      page: 1,
      pageSize: 20,
    });
    expect(walletMovementListQuerySchema.parse({ kind: 'REFUND' }).kind).toBe('REFUND');
    expect(walletMovementListQuerySchema.safeParse({ kind: 'GIFT' }).success).toBe(false);
    expect(
      walletMovementListQuerySchema.safeParse({ from: '2026-10-14', to: '2026-10-13' }).success,
    ).toBe(false);
  });

  it('lets a debit carry the moment after which it no longer applies, as an ISO date and time', () => {
    const payBy = '2026-10-19T16:40:00.000Z';

    expect(walletDebitRequestSchema.parse({ ...debit, payBy })).toEqual({ ...debit, payBy });
    expect(walletDebitRequestSchema.parse(debit)).not.toHaveProperty('payBy');
    expect(walletDebitRequestSchema.safeParse({ ...debit, payBy: '2026-10-19' }).success).toBe(
      false,
    );
    expect(walletDebitRequestSchema.safeParse({ ...debit, payBy: 'soon' }).success).toBe(false);
  });

  it('answers a debit with the movement, the balance and, optionally, the email of the client', () => {
    const answer = { movementId: '9f8e7d6c-5b4a-4f3e-8d2c-1b0a9f8e7d6c', balance: 30 };

    expect(walletDebitSchema.parse(answer)).toEqual(answer);
    expect(walletDebitSchema.parse({ ...answer, email: 'ana@debus.test' })).toEqual({
      ...answer,
      email: 'ana@debus.test',
    });
    expect(walletDebitSchema.safeParse({ ...answer, email: 'not-an-email' }).success).toBe(false);
  });
});
