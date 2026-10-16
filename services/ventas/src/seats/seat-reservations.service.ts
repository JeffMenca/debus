import type { SaleChannel } from '@debus/contracts';
import { isUniqueViolation } from '@debus/server';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MESSAGES } from '../messages';
import { PrismaService } from '../prisma/prisma.service';
import { departed, seatsOutsideBus, ticketTotal } from './seat-rules';

export interface SeatReservation {
  ticketId: string;
  tripId: string;
  seats: number[];
  channel: SaleChannel;
  clientId: string | null;
  nit: string;
  buyerName: string;
  email: string | null;
  paidOn: string;
}

export interface ReservedTicket {
  ticketId: string;
  unitPrice: number;
  total: number;
}

@Injectable()
export class SeatReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Holds the seats with a PENDING ticket. The primary key (trip_id, seat_number) decides who gets
  // a seat: the ticket and its seats are one insert, so a taken seat leaves nothing behind.
  async reserve(request: SeatReservation): Promise<ReservedTicket> {
    const trip = await this.prisma.trip.findUnique({ where: { tripId: request.tripId } });
    if (!trip) throw new NotFoundException(MESSAGES.tripNotFound);
    if (departed(trip.departureAt, new Date())) {
      throw new ConflictException(MESSAGES.tripDeparted);
    }
    const outside = seatsOutsideBus(request.seats, trip.capacity);
    if (outside.length > 0) {
      throw new BadRequestException(MESSAGES.seatOutsideBus(outside, trip.capacity));
    }

    const unitPrice = trip.ticketPrice.toNumber();
    const total = ticketTotal(unitPrice, request.seats.length);
    const seats = [...request.seats].sort((a, b) => a - b);
    try {
      await this.prisma.ticket.create({
        data: {
          id: request.ticketId,
          tripId: request.tripId,
          status: 'PENDING',
          channel: request.channel,
          clientId: request.clientId,
          nit: request.nit,
          buyerName: request.buyerName,
          email: request.email,
          unitPrice,
          total,
          paidOn: new Date(`${request.paidOn}T00:00:00.000Z`),
          // Always in the same order, so two overlapping purchases wait instead of deadlocking.
          seats: { create: seats.map((seatNumber) => ({ tripId: request.tripId, seatNumber })) },
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(MESSAGES.seatTaken);
      throw error;
    }
    return { ticketId: request.ticketId, unitPrice, total };
  }
}
