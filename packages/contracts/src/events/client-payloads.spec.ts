import { exampleRentalPaid, rentalPaidPayloadSchema } from '../index';

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
