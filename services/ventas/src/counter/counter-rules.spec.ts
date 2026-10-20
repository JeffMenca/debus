import { Prisma } from '../generated/prisma/client';
import type { SoldTicket } from '../tickets/ticket-rules';
import { GENERIC_BUYER, buyerNameFor, sameSale } from './counter-rules';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const tripId = '5b4a3f2e-1d0c-4b9a-8f7e-6d5c4b3a2f1e';
const sold: SoldTicket = {
  id: '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b',
  tripId,
  status: 'CONFIRMED',
  channel: 'COUNTER',
  clientId: null,
  nit: 'CF',
  buyerName: GENERIC_BUYER,
  email: null,
  unitPrice: new Prisma.Decimal(85.5),
  total: new Prisma.Decimal(171),
  paidOn: new Date('2026-10-18T00:00:00.000Z'),
  createdAt: new Date('2026-10-18T15:30:00.000Z'),
  seats: [{ seatNumber: 9 }, { seatNumber: 10 }],
  trip: {
    tripId,
    branchId,
    routeId: '3b2c1d0e-6f5a-4b4c-9d8e-7f6a5b4c3d2e',
    busId: '1f0e2d3c-4b5a-4968-8776-655443322110',
    busPlate: 'C482BTX',
    originLabel: 'Quetzaltenango',
    destinationLabel: 'Guatemala',
    capacity: 40,
    ticketPrice: new Prisma.Decimal(85.5),
    departureAt: new Date('2026-10-20T11:30:00.000Z'),
    estimatedArrivalAt: new Date('2026-10-20T15:45:00.000Z'),
    searchText: '',
    createdAt: new Date('2026-10-16T12:00:00.000Z'),
  },
};

describe('sameSale', () => {
  const request = { tripId, seats: [10, 9] };

  it('recognizes a retry of the same counter sale, whatever the order of the seats', () => {
    expect(sameSale(sold, request, branchId)).toBe(true);
  });

  it('tells apart a key used for another trip, other seats, an online sale or another branch', () => {
    expect(sameSale(sold, { ...request, tripId: sold.trip.routeId }, branchId)).toBe(false);
    expect(sameSale(sold, { ...request, seats: [9] }, branchId)).toBe(false);
    expect(sameSale({ ...sold, channel: 'ONLINE' }, request, branchId)).toBe(false);
    expect(sameSale(sold, request, sold.trip.busId)).toBe(false);
  });
});

describe('buyerNameFor', () => {
  it('prefers the name written at the counter, then the profile, then the generic client', () => {
    expect(buyerNameFor('Luis Pérez', { fullName: 'Ana Méndez' })).toBe('Luis Pérez');
    expect(buyerNameFor(undefined, { fullName: 'Ana Méndez' })).toBe('Ana Méndez');
    expect(buyerNameFor(undefined, null)).toBe('Consumidor final');
  });
});
