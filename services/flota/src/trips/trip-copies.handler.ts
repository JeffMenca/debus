import {
  type EventEnvelope,
  tripCompletedPayloadSchema,
  tripDeletedPayloadSchema,
  tripDepartedPayloadSchema,
  tripScheduledPayloadSchema,
} from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable, Logger } from '@nestjs/common';
import type { TripCopyStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { advancesStatus } from './trip-copy-rules';

interface TripWindow {
  tripId: string;
  busId: string;
  driverId: string;
  routeId: string | null;
  departureAt: string;
  estimatedArrivalAt: string;
}

@Injectable()
export class TripCopiesHandler {
  private readonly logger = new Logger(TripCopiesHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('TripScheduled')
  async scheduled(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const trip = tripScheduledPayloadSchema.parse(payload);
    const db = tx ?? this.prisma;
    await this.queueEventsOf(db, trip.tripId);
    if (await this.wasDeleted(db, trip.tripId)) return;
    if (!(await this.ownsBus(db, trip.busId))) return;
    const created = await this.advance(db, trip, 'SCHEDULED');
    // A departure that came first made the copy with an empty window and no route: the schedule has both.
    if (!created) await this.completeWindow(db, trip);
    if (trip.routeId) {
      await db.$executeRawUnsafe(
        'UPDATE routes SET has_trips = true WHERE id = $1::uuid',
        trip.routeId,
      );
    }
  }

  @OnEvent('TripDeleted')
  async deleted(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const trip = tripDeletedPayloadSchema.parse(payload);
    const db = tx ?? this.prisma;
    await this.queueEventsOf(db, trip.tripId);
    await db.$executeRawUnsafe(
      `DELETE FROM trip_copies WHERE trip_id = $1::uuid AND status = 'SCHEDULED'`,
      trip.tripId,
    );
    await db.$executeRawUnsafe(
      'INSERT INTO deleted_trips (trip_id, branch_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT (trip_id) DO NOTHING',
      trip.tripId,
      trip.branchId,
    );
  }

  @OnEvent('TripDeparted')
  async departed(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const trip = tripDepartedPayloadSchema.parse(payload);
    const db = tx ?? this.prisma;
    await this.queueEventsOf(db, trip.tripId);
    if (!(await this.ownsBus(db, trip.busId))) return;
    const moved = await this.advance(
      db,
      { ...trip, routeId: null, departureAt: trip.departedAt, estimatedArrivalAt: trip.departedAt },
      'IN_TRANSIT',
    );
    if (moved) {
      await db.$executeRawUnsafe(
        'UPDATE buses SET in_transit = true WHERE id = $1::uuid',
        trip.busId,
      );
    }
  }

  @OnEvent('TripCompleted')
  async completed(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const trip = tripCompletedPayloadSchema.parse(payload);
    const db = tx ?? this.prisma;
    await this.queueEventsOf(db, trip.tripId);
    if (!(await this.ownsBus(db, trip.busId))) return;
    const moved = await this.advance(
      db,
      { ...trip, departureAt: trip.departedAt, estimatedArrivalAt: trip.arrivedAt },
      'COMPLETED',
    );
    if (!moved) return;
    await db.$executeRawUnsafe(
      `UPDATE buses SET in_transit = false, completed_trips = completed_trips + 1,
         mileage_km = GREATEST(mileage_km, $2), version = version + 1 WHERE id = $1::uuid`,
      trip.busId,
      trip.endMileageKm,
    );
    await db.$executeRawUnsafe(
      'UPDATE drivers SET completed_trips = completed_trips + 1 WHERE id = $1::uuid',
      trip.driverId,
    );
  }

  // Pub/Sub delivers the events of one trip in any order and at the same time: each waits here for
  // the previous one to commit, so a TripDeleted always sees the copy a concurrent TripScheduled made.
  private async queueEventsOf(db: SqlClient, tripId: string): Promise<void> {
    await db.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      `trip-copy:${tripId}`,
    );
  }

  private async completeWindow(db: SqlClient, trip: TripWindow): Promise<void> {
    await db.$executeRawUnsafe(
      `UPDATE trip_copies SET route_id = $2::uuid, departure_at = $3::timestamptz, estimated_arrival_at = $4::timestamptz
       WHERE trip_id = $1::uuid AND status <> 'COMPLETED'`,
      trip.tripId,
      trip.routeId,
      trip.departureAt,
      trip.estimatedArrivalAt,
    );
  }

  // Locks the row so concurrent events of the same trip apply one after the other; returns
  // whether the status moved forward (only then do the counters change).
  private async advance(db: SqlClient, trip: TripWindow, next: TripCopyStatus): Promise<boolean> {
    const rows = await db.$queryRawUnsafe<{ status: TripCopyStatus }[]>(
      'SELECT status FROM trip_copies WHERE trip_id = $1::uuid FOR UPDATE',
      trip.tripId,
    );
    const current = rows[0]?.status ?? null;
    if (!advancesStatus(current, next)) return false;
    await db.$executeRawUnsafe(
      `INSERT INTO trip_copies (trip_id, bus_id, driver_id, route_id, departure_at, estimated_arrival_at, status, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::timestamptz, $6::timestamptz, $7::"TripCopyStatus", now())
       ON CONFLICT (trip_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
      trip.tripId,
      trip.busId,
      trip.driverId,
      trip.routeId,
      trip.departureAt,
      trip.estimatedArrivalAt,
      next,
    );
    return true;
  }

  private async wasDeleted(db: SqlClient, tripId: string): Promise<boolean> {
    const rows = await db.$queryRawUnsafe<unknown[]>(
      'SELECT 1 FROM deleted_trips WHERE trip_id = $1::uuid',
      tripId,
    );
    return rows.length > 0;
  }

  private async ownsBus(db: SqlClient, busId: string): Promise<boolean> {
    const rows = await db.$queryRawUnsafe<unknown[]>(
      'SELECT 1 FROM buses WHERE id = $1::uuid',
      busId,
    );
    if (rows.length === 0) {
      this.logger.warn({ busId }, 'Trip event for a bus that flota does not know');
    }
    return rows.length > 0;
  }
}
