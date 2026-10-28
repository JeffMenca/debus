import {
  type EventEnvelope,
  tripCompletedPayloadSchema,
  tripDeletedPayloadSchema,
  tripDepartedPayloadSchema,
  tripScheduledPayloadSchema,
} from '@debus/contracts';
import { OnEvent, Outbox, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { type RefundRow, isOnSale, toRefundRequested, toTripRow } from './trip-rules';

// A scheduled trip never changes afterwards, so a repeated event leaves the copy as it is. A trip
// deleted before its copy arrived (events may come out of order) is never copied.
const INSERT_TRIP = `
  INSERT INTO trips (trip_id, branch_id, route_id, bus_id, bus_plate, origin_label, destination_label,
    capacity, ticket_price, departure_at, estimated_arrival_at, search_text)
  SELECT $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10::timestamptz, $11::timestamptz, $12
  WHERE NOT EXISTS (SELECT 1 FROM deleted_trips WHERE trip_id = $1::uuid)
  ON CONFLICT (trip_id) DO NOTHING`;

// A reservation in flight holds a key share lock on the trip row through its ticket: waiting for it
// here means its purchase is already visible to CLOSE_PURCHASES, and later ones find no trip.
const LOCK_TRIP = 'SELECT trip_id FROM trips WHERE trip_id = $1::uuid FOR UPDATE';

// Closes every open purchase of the trip and returns those whose debit may have left. The update
// locks each purchase and reads its latest attempts, so a debit claimed a moment before is counted
// and one claimed after finds the purchase closed. A confirmed purchase always sent its debit.
const CLOSE_PURCHASES = `
  WITH closed AS (
    UPDATE purchases SET status = 'FAILED', failure = 'TRIP_CANCELLED',
      locked_until = NULL, last_error = NULL, updated_at = now()
    WHERE trip_id = $1::uuid AND status IN ('PENDING', 'CONFIRMED')
    RETURNING id, client_id, seats, amount, debit_attempts)
  SELECT c.id, c.client_id, c.seats, c.amount::float8 AS amount, COALESCE(t.nit, 'CF') AS nit,
    tr.origin_label, tr.destination_label, tr.departure_at
  FROM closed c
  JOIN trips tr ON tr.trip_id = $1::uuid
  LEFT JOIN tickets t ON t.id = c.id
  WHERE c.debit_attempts > 0
  ORDER BY c.id`;

// Tickets and seats, online and at the counter, go with the trip by CASCADE.
const DELETE_TRIP = 'DELETE FROM trips WHERE trip_id = $1::uuid';
const BURY_TRIP =
  'INSERT INTO deleted_trips (trip_id) VALUES ($1::uuid) ON CONFLICT (trip_id) DO NOTHING';

// The mark has no link to the trip copy: the event may arrive before the copy does, and a repeated
// or late one leaves the first departure as it was.
const MARK_DEPARTED = `
  INSERT INTO departed_trips (trip_id, departed_at) VALUES ($1::uuid, $2::timestamptz)
  ON CONFLICT (trip_id) DO NOTHING`;

@Injectable()
export class TripsHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: Outbox,
  ) {}

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

  // Wallet purchases are refunded by clientes, which knows whether the money really moved; counter
  // sales were paid in cash and are given back at the counter.
  @OnEvent('TripDeleted')
  async deleted(payload: unknown, envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const trip = tripDeletedPayloadSchema.parse(payload);
    if (trip.type !== 'REGULAR') return;
    const sql = tx ?? this.prisma;
    await sql.$queryRawUnsafe(LOCK_TRIP, trip.tripId);
    const refunds = await sql.$queryRawUnsafe<RefundRow[]>(CLOSE_PURCHASES, trip.tripId);
    for (const row of refunds) {
      await this.outbox.add(
        sql,
        'RefundRequested',
        toRefundRequested(row, trip.tripId, envelope.occurredAt),
        envelope.correlationId,
      );
    }
    const dropped = await sql.$executeRawUnsafe(DELETE_TRIP, trip.tripId);
    if (dropped === 0) await sql.$executeRawUnsafe(BURY_TRIP, trip.tripId);
  }

  // Once the bus leaves the sale is over, even before the scheduled hour.
  @OnEvent('TripDeparted')
  async departed(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const trip = tripDepartedPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(MARK_DEPARTED, trip.tripId, trip.departedAt);
  }

  // The same mark if TripDeparted was lost on its way.
  @OnEvent('TripCompleted')
  async completed(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const trip = tripCompletedPayloadSchema.parse(payload);
    if (trip.type !== 'REGULAR') return;
    await (tx ?? this.prisma).$executeRawUnsafe(MARK_DEPARTED, trip.tripId, trip.departedAt);
  }
}
