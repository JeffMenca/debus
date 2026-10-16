import {
  exampleProfileUpdated,
  exampleRentalPaid,
  profileUpdatedPayloadSchema,
  rentalPaidPayloadSchema,
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
