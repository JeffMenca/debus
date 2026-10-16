import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { MESSAGES } from '../messages';
import { type SeatReservation, SeatReservationsService } from './seat-reservations.service';

const tripId = '5b4a3f2e-1d0c-4b9a-8f7e-6d5c4b3a2f1e';
const ticketId = '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b';
const reservation: SeatReservation = {
  ticketId,
  tripId,
  seats: [9, 2],
  channel: 'ONLINE',
  clientId: '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a',
  nit: '45218376',
  buyerName: 'Ana Méndez',
  email: 'ana@correo.com',
  paidOn: '2026-10-16',
};
const trip = (over: Record<string, unknown> = {}) => ({
  tripId,
  capacity: 40,
  ticketPrice: new Prisma.Decimal(85.5),
  departureAt: new Date(Date.now() + 3_600_000),
  ...over,
});
const prismaError = (code: string) => Object.assign(new Error(code), { code });

function setup() {
  const prisma = {
    trip: { findUnique: jest.fn().mockResolvedValue(trip()) },
    ticket: { create: jest.fn().mockResolvedValue({}) },
  };
  return { prisma, service: new SeatReservationsService(prisma as never) };
}

describe('SeatReservationsService', () => {
  it('holds the seats with a pending ticket at the price of the trip', async () => {
    const { prisma, service } = setup();

    await expect(service.reserve(reservation)).resolves.toEqual({
      ticketId,
      unitPrice: 85.5,
      total: 171,
    });
    expect(prisma.ticket.create).toHaveBeenCalledWith({
      data: {
        id: ticketId,
        tripId,
        status: 'PENDING',
        channel: 'ONLINE',
        clientId: reservation.clientId,
        nit: '45218376',
        buyerName: 'Ana Méndez',
        email: 'ana@correo.com',
        unitPrice: 85.5,
        total: 171,
        paidOn: new Date('2026-10-16T00:00:00.000Z'),
        // Always in the same order, so two overlapping purchases wait instead of deadlocking.
        seats: {
          create: [
            { tripId, seatNumber: 2 },
            { tripId, seatNumber: 9 },
          ],
        },
      },
    });
  });

  it('answers 404 for a trip it does not know', async () => {
    const { prisma, service } = setup();
    prisma.trip.findUnique.mockResolvedValue(null);

    await expect(service.reserve(reservation)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });

  it('refuses a trip that already left', async () => {
    const { prisma, service } = setup();
    prisma.trip.findUnique.mockResolvedValue(trip({ departureAt: new Date(Date.now() - 1000) }));

    await expect(service.reserve(reservation)).rejects.toThrow(
      new ConflictException(MESSAGES.tripDeparted),
    );
  });

  it('refuses seats the bus does not have', async () => {
    const { prisma, service } = setup();
    prisma.trip.findUnique.mockResolvedValue(trip({ capacity: 8 }));

    await expect(service.reserve(reservation)).rejects.toThrow(
      new BadRequestException(MESSAGES.seatOutsideBus([9], 8)),
    );
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });

  it('answers 409 when the database finds a seat already taken', async () => {
    const { prisma, service } = setup();
    prisma.ticket.create.mockRejectedValue(prismaError('P2002'));

    await expect(service.reserve(reservation)).rejects.toThrow(
      new ConflictException(MESSAGES.seatTaken),
    );
  });

  it('lets any other failure through', async () => {
    const { prisma, service } = setup();
    prisma.ticket.create.mockRejectedValue(prismaError('P1001'));

    await expect(service.reserve(reservation)).rejects.toMatchObject({ code: 'P1001' });
  });
});
