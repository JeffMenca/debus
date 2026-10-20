import { ticketSchema, ticketSoldPayloadSchema } from '@debus/contracts';
import { Prisma } from '../generated/prisma/client';
import { type SoldTicket, toTicket, toTicketSoldPayload } from './ticket-rules';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const tripId = '5b4a3f2e-1d0c-4b9a-8f7e-6d5c4b3a2f1e';
const sold: SoldTicket = {
  id: '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b',
  tripId,
  status: 'CONFIRMED',
  channel: 'COUNTER',
  clientId: null,
  nit: 'CF',
  buyerName: 'Consumidor final',
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

describe('toTicket', () => {
  it('answers the ticket as the contract describes it', () => {
    const ticket = toTicket(sold);

    expect(ticket).toEqual({
      id: sold.id,
      status: 'CONFIRMED',
      channel: 'COUNTER',
      tripId,
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      departureAt: '2026-10-20T11:30:00.000Z',
      busPlate: 'C482BTX',
      seats: [9, 10],
      unitPrice: 85.5,
      total: 171,
      nit: 'CF',
      buyerName: 'Consumidor final',
      paidOn: '2026-10-18',
      soldAt: '2026-10-18T15:30:00.000Z',
    });
    expect(ticketSchema.parse(ticket)).toEqual(ticket);
  });
});

describe('toTicketSoldPayload', () => {
  it('carries the origin branch of the trip and fits the contract', () => {
    const payload = toTicketSoldPayload({ ...sold, clientId: tripId, email: 'ana@correo.com' });

    expect(payload).toMatchObject({
      ticketId: sold.id,
      branchId,
      routeId: sold.trip.routeId,
      busId: sold.trip.busId,
      channel: 'COUNTER',
      clientId: tripId,
      email: 'ana@correo.com',
      seats: [9, 10],
      unitPrice: 85.5,
      total: 171,
      paidOn: '2026-10-18',
      soldAt: '2026-10-18T15:30:00.000Z',
    });
    expect(ticketSoldPayloadSchema.safeParse(payload).success).toBe(true);
  });
});
