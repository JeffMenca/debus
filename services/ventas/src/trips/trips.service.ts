import {
  type AvailableTrip,
  type AvailableTripListQuery,
  type AvailableTripPage,
  type SeatMap,
  type TripPlaces,
  pageArgs,
  toPage,
} from '@debus/contracts';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { MESSAGES } from '../messages';
import { PrismaService } from '../prisma/prisma.service';
import { onSaleConditions } from './trip-rules';

interface TripOnSaleRow {
  tripId: string;
  routeId: string;
  branchId: string;
  originLabel: string;
  destinationLabel: string;
  departureAt: Date;
  estimatedArrivalAt: Date;
  ticketPrice: Prisma.Decimal;
  busPlate: string;
  capacity: number;
  freeSeats: number;
}

// Prisma cannot filter by a count of a relation, so the free seats are counted in SQL.
const tripsOnSale = (where: Prisma.Sql) => Prisma.sql`
  FROM trips t
  LEFT JOIN (SELECT trip_id, count(*)::int AS taken FROM ticket_seats GROUP BY trip_id) s
    ON s.trip_id = t.trip_id
  WHERE ${where}`;

function toAvailableTrip(row: TripOnSaleRow): AvailableTrip {
  return {
    ...row,
    departureAt: row.departureAt.toISOString(),
    estimatedArrivalAt: row.estimatedArrivalAt.toISOString(),
    ticketPrice: Number(row.ticketPrice),
  };
}

@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AvailableTripListQuery, branchId?: string): Promise<AvailableTripPage> {
    const from = tripsOnSale(onSaleConditions(query, new Date(), branchId));
    const { skip, take } = pageArgs(query);
    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<TripOnSaleRow[]>(Prisma.sql`
        SELECT t.trip_id AS "tripId", t.route_id AS "routeId", t.branch_id AS "branchId",
          t.origin_label AS "originLabel", t.destination_label AS "destinationLabel",
          t.departure_at AS "departureAt", t.estimated_arrival_at AS "estimatedArrivalAt",
          t.ticket_price AS "ticketPrice", t.bus_plate AS "busPlate", t.capacity,
          t.capacity - COALESCE(s.taken, 0) AS "freeSeats"
        ${from}
        ORDER BY t.departure_at, t.trip_id LIMIT ${take} OFFSET ${skip}`),
      this.prisma.$queryRaw<[{ total: number }]>(Prisma.sql`SELECT count(*)::int AS total ${from}`),
    ]);
    return toPage(rows.map(toAvailableTrip), total, query);
  }

  async places(): Promise<TripPlaces> {
    const where = { departureAt: { gt: new Date() } };
    const [origins, destinations] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        distinct: ['originLabel'],
        select: { originLabel: true },
        orderBy: { originLabel: 'asc' },
      }),
      this.prisma.trip.findMany({
        where,
        distinct: ['destinationLabel'],
        select: { destinationLabel: true },
        orderBy: { destinationLabel: 'asc' },
      }),
    ]);
    return {
      origins: origins.map((trip) => trip.originLabel),
      destinations: destinations.map((trip) => trip.destinationLabel),
    };
  }

  async seatMap(tripId: string): Promise<SeatMap> {
    const trip = await this.prisma.trip.findUnique({
      where: { tripId },
      include: { seats: { select: { seatNumber: true }, orderBy: { seatNumber: 'asc' } } },
    });
    if (!trip) throw new NotFoundException(MESSAGES.tripNotFound);
    return {
      tripId: trip.tripId,
      originLabel: trip.originLabel,
      destinationLabel: trip.destinationLabel,
      busPlate: trip.busPlate,
      capacity: trip.capacity,
      ticketPrice: trip.ticketPrice.toNumber(),
      departureAt: trip.departureAt.toISOString(),
      estimatedArrivalAt: trip.estimatedArrivalAt.toISOString(),
      taken: trip.seats.map((seat) => seat.seatNumber),
    };
  }
}
