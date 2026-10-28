export const seatsOutsideBus = (seats: number[], capacity: number): number[] =>
  seats.filter((seat) => seat > capacity);

// In cents, so Q 33.35 × 3 is Q 100.05 and not Q 100.04999...
export const ticketTotal = (unitPrice: number, seatCount: number): number =>
  (Math.round(unitPrice * 100) * seatCount) / 100;
