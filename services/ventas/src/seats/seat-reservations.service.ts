import type { SaleChannel } from '@debus/contracts';
import { isConstraintViolation, isUniqueViolation } from '@debus/server';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
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
  departureAt: Date;
  originLabel: string;
  destinationLabel: string;
}

// The ticket id (or another key of the same write) was already used: the caller reloads what it wrote.
export class DuplicateTicketError extends ConflictException {
  constructor() {
    super(MESSAGES.purchaseKeyReused);
  }
}

const SEAT_KEY = 'ticket_seats_pkey';

@Injectable()
export class SeatReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Holds the seats with a PENDING ticket. The primary key (trip_id, seat_number) decides who gets
  // a seat: the ticket, its seats and the writes the caller adds are one batch, so a taken seat leaves
  // nothing behind. A batch and not an interactive transaction: nothing waits on the pool while it runs.
  // The caller builds its writes from the price and the trip, which are known only here.
  async reserve(
    request: SeatReservation,
    alongside: (reserved: ReservedTicket) => Prisma.PrismaPromise<unknown>[] = () => [],
  ): Promise<ReservedTicket> {
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
    const reserved: ReservedTicket = {
      ticketId: request.ticketId,
      unitPrice,
      total,
      departureAt: trip.departureAt,
      originLabel: trip.originLabel,
      destinationLabel: trip.destinationLabel,
    };
    try {
      await this.prisma.$transaction([
        this.prisma.ticket.create({
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
        }),
        ...alongside(reserved),
      ]);
    } catch (error) {
      if (isConstraintViolation(error, SEAT_KEY)) throw new ConflictException(MESSAGES.seatTaken);
      if (isUniqueViolation(error)) throw new DuplicateTicketError();
      throw error;
    }
    return reserved;
  }
}
