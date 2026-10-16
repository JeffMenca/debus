import {
  SEAT_LIMIT,
  buyerProblems,
  chargeLabel,
  saleTotal,
  seatRows,
  toCounterSaleRequest,
  toggleSeat,
} from './counter-sale';

describe('toggleSeat', () => {
  it('adds a seat in order and takes it out on a second touch', () => {
    expect(toggleSeat([9], 2)).toEqual([2, 9]);
    expect(toggleSeat([2, 9], 9)).toEqual([2]);
  });

  it('never goes past the seats one sale may carry', () => {
    const full = Array.from({ length: SEAT_LIMIT }, (_, index) => index + 1);

    expect(toggleSeat(full, 20)).toBe(full);
  });
});

describe('saleTotal and chargeLabel', () => {
  it('multiplies in cents and names the amount on the button', () => {
    expect(saleTotal(33.35, 3)).toBe(100.05);
    expect(chargeLabel(170)).toMatch(/^Cobrar Q\s?170\.00$/);
    expect(chargeLabel(0)).toBe('Cobrar');
  });
});

describe('seatRows', () => {
  it('lays the seats two by two on each side of the aisle', () => {
    expect(seatRows(10)).toEqual([
      { left: [1, 2], right: [3, 4] },
      { left: [5, 6], right: [7, 8] },
      { left: [9, 10], right: [] },
    ]);
  });
});

describe('buyerProblems', () => {
  it('accepts an empty buyer, the generic client of the counter', () => {
    expect(buyerProblems({ nit: '', buyerName: '', email: '' })).toEqual({});
  });

  it('points at a NIT, a name or an email the sale would refuse', () => {
    expect(buyerProblems({ nit: '12-x', buyerName: 'A', email: 'ana@' })).toEqual({
      nit: 'Revisa el NIT o déjalo vacío para consumidor final.',
      buyerName: 'Escribe el nombre completo o déjalo vacío.',
      email: 'Revisa el correo o déjalo vacío.',
    });
  });
});

describe('toCounterSaleRequest', () => {
  it('sends the generic client when the NIT is empty and leaves out what was not written', () => {
    expect(
      toCounterSaleRequest('trip', [3, 4], '2026-10-18', { nit: ' ', buyerName: '', email: '' }),
    ).toEqual({ tripId: 'trip', seats: [3, 4], paidOn: '2026-10-18', nit: 'CF' });
  });

  it('sends the NIT, the name and the email trimmed', () => {
    expect(
      toCounterSaleRequest('trip', [3], '2026-10-18', {
        nit: ' 4521837-6 ',
        buyerName: ' Ana Méndez ',
        email: ' ana@correo.com ',
      }),
    ).toEqual({
      tripId: 'trip',
      seats: [3],
      paidOn: '2026-10-18',
      nit: '4521837-6',
      buyerName: 'Ana Méndez',
      email: 'ana@correo.com',
    });
  });
});
