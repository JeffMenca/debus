import { departed, seatsOutsideBus, ticketTotal } from './seat-rules';

describe('seatsOutsideBus', () => {
  it('names the seats past the capacity of the bus', () => {
    expect(seatsOutsideBus([3, 41, 45], 40)).toEqual([41, 45]);
    expect(seatsOutsideBus([1, 40], 40)).toEqual([]);
  });
});

describe('ticketTotal', () => {
  it('multiplies the price by the seats without floating point drift', () => {
    expect(ticketTotal(85, 2)).toBe(170);
    expect(ticketTotal(0.1, 3)).toBe(0.3);
    expect(ticketTotal(33.35, 3)).toBe(100.05);
  });
});

describe('departed', () => {
  const now = new Date('2026-10-16T12:00:00.000Z');

  it('closes the sale at the scheduled departure', () => {
    expect(departed(new Date('2026-10-16T12:00:00.000Z'), now)).toBe(true);
    expect(departed(new Date('2026-10-16T11:59:00.000Z'), now)).toBe(true);
    expect(departed(new Date('2026-10-16T12:01:00.000Z'), now)).toBe(false);
  });
});
