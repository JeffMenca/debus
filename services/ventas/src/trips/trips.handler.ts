import { type EventEnvelope, tripScheduledPayloadSchema } from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isOnSale, toTripRow } from './trip-rules';

// A scheduled trip never changes afterwards, so a repeated event leaves the copy as it is.
const INSERT_TRIP = `
  INSERT INTO trips (trip_id, branch_id, route_id, bus_id, bus_plate, origin_label, destination_label,
    capacity, ticket_price, departure_at, estimated_arrival_at, search_text)
  VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10::timestamptz, $11::timestamptz, $12)
  ON CONFLICT (trip_id) DO NOTHING`;

@Injectable()
export class TripsHandler {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('TripScheduled')
  async scheduled(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const trip = tripScheduledPayloadSchema.parse(payload);
    if (!isOnSale(trip)) return;
    const row = toTripRow(trip);
    await (tx ?? this.prisma).$executeRawUnsafe(
      INSERT_TRIP,
      row.tripId,
      row.branchId,
      row.routeId,
      row.busId,
      row.busPlate,
      row.originLabel,
      row.destinationLabel,
      row.capacity,
      row.ticketPrice,
      row.departureAt,
      row.estimatedArrivalAt,
      row.searchText,
    );
  }
}
