import {
  exampleProfileUpdated,
  exampleRentalPaid,
  exampleWalletCredited,
  profileUpdatedPayloadSchema,
  rentalPaidPayloadSchema,
  walletCreditedPayloadSchema,
} from '../index';

describe('RentalPaid', () => {
  it('validates its example', () => {
    expect(rentalPaidPayloadSchema.parse(exampleRentalPaid)).toEqual(exampleRentalPaid);
  });

  it('allows a one-way rental and a walk-in client without account', () => {
    expect(
      rentalPaidPayloadSchema.safeParse({ ...exampleRentalPaid, returnAt: null, clientId: null })
        .success,
    ).toBe(true);
  });

  it('carries the email to confirm the rental, null for a walk-in client without one', () => {
    expect(rentalPaidPayloadSchema.parse(exampleRentalPaid).email).toBe('reservas@colegio.edu.gt');
    expect(rentalPaidPayloadSchema.safeParse({ ...exampleRentalPaid, email: null }).success).toBe(
      true,
    );
    expect(
      rentalPaidPayloadSchema.safeParse({ ...exampleRentalPaid, email: undefined }).success,
    ).toBe(false);
  });

  it('refuses a return before the departure', () => {
    expect(
      rentalPaidPayloadSchema.safeParse({
        ...exampleRentalPaid,
        returnAt: '2026-10-24T10:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('ProfileUpdated', () => {
  it('validates its example and a profile without NIT', () => {
    expect(profileUpdatedPayloadSchema.parse(exampleProfileUpdated)).toEqual(exampleProfileUpdated);
    expect(
      profileUpdatedPayloadSchema.safeParse({ ...exampleProfileUpdated, nit: null }).success,
    ).toBe(true);
  });

  it('refuses a client that is not an id and a NIT longer than the contract allows', () => {
    expect(
      profileUpdatedPayloadSchema.safeParse({ ...exampleProfileUpdated, clientId: 'ana' }).success,
    ).toBe(false);
    expect(
      profileUpdatedPayloadSchema.safeParse({ ...exampleProfileUpdated, nit: '1'.repeat(21) })
        .success,
    ).toBe(false);
  });
});

describe('WalletCredited', () => {
  it('validates its example and a refund', () => {
    expect(walletCreditedPayloadSchema.parse(exampleWalletCredited)).toEqual(exampleWalletCredited);
    expect(
      walletCreditedPayloadSchema.safeParse({
        ...exampleWalletCredited,
        kind: 'REFUND',
        description: 'Devolución: Boleto Quetzaltenango - Guatemala, asiento 5',
      }).success,
    ).toBe(true);
  });

  it('only credits: refuses debits, negative amounts and an invalid email', () => {
    for (const change of [{ kind: 'TICKET' }, { amount: -10 }, { email: 'ana' }]) {
      expect(
        walletCreditedPayloadSchema.safeParse({ ...exampleWalletCredited, ...change }).success,
      ).toBe(false);
    }
  });
});
