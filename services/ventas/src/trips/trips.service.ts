import {
  type AvailableTrip,
  type AvailableTripListQuery,
  type AvailableTripPage,
  type SeatMap,
  pageArgs,
  toPage,
} from '@debus/contracts';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Trip } from '../generated/prisma/client';
import { MESSAGES } from '../messages';
import { PrismaService } from '../prisma/prisma.service';
import { onSaleWhere } from './trip-rules';

function toAvailableTrip(row: Trip & { _count: { seats: number } }): AvailableTrip {
  return {
    tripId: row.tripId,
    routeId: row.routeId,
    branchId: row.branchId,
    originLabel: row.originLabel,
    destinationLabel: row.destinationLabel,
    departureAt: row.departureAt.toISOString(),
    estimatedArrivalAt: row.estimatedArrivalAt.toISOString(),
    ticketPrice: row.ticketPrice.toNumber(),
    busPlate: row.busPlate,
    capacity: row.capacity,
    freeSeats: row.capacity - row._count.seats,
  };
}

@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AvailableTripListQuery): Promise<AvailableTripPage> {
    const where = onSaleWhere(query, new Date());
    const [rows, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        // The id breaks ties, so a trip never shows up on two pages or on none.
        orderBy: [{ departureAt: 'asc' }, { tripId: 'asc' }],
        include: { _count: { select: { seats: true } } },
        ...pageArgs(query),
      }),
      this.prisma.trip.count({ where }),
    ]);
    return toPage(rows.map(toAvailableTrip), total, query);
  }

  async seatMap(tripId: string): Promise<SeatMap> {
    const trip = await this.prisma.trip.findUnique({
      where: { tripId },
      include: { seats: { select: { seatNumber: true }, orderBy: { seatNumber: 'asc' } } },
    });
    if (!trip) throw new NotFoundException(MESSAGES.tripNotFound);
    return {
      tripId: trip.tripId,
      capacity: trip.capacity,
      ticketPrice: trip.ticketPrice.toNumber(),
      departureAt: trip.departureAt.toISOString(),
      taken: trip.seats.map((seat) => seat.seatNumber),
    };
  }
}
