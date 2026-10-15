import {
  type EventEnvelope,
  tripCompletedPayloadSchema,
  tripDeletedPayloadSchema,
  tripDepartedPayloadSchema,
  tripScheduledPayloadSchema,
} from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// The facts of a trip arrive from four events in any order: each statement writes only its own
// columns, so a late event never erases what another one already recorded.
const SCHEDULED = `
  INSERT INTO branch_report_trips (id, branch_id, bus_id, driver_id, type, route_id, rental_id, bus_plate,
    origin_label, destination_label, departure_at, updated_at)
  VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, $7::uuid, $8, $9, $10, $11::timestamptz, now())
  ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, route_id = EXCLUDED.route_id,
    rental_id = EXCLUDED.rental_id, bus_plate = EXCLUDED.bus_plate, origin_label = EXCLUDED.origin_label,
    destination_label = EXCLUDED.destination_label, departure_at = EXCLUDED.departure_at, updated_at = now()`;

const DEPARTED = `
  INSERT INTO branch_report_trips (id, branch_id, bus_id, driver_id, departed_at, start_mileage_km, updated_at)
  VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::timestamptz, $6, now())
  ON CONFLICT (id) DO UPDATE SET departed_at = EXCLUDED.departed_at,
    start_mileage_km = EXCLUDED.start_mileage_km, updated_at = now()`;

const COMPLETED = `
  INSERT INTO branch_report_trips (id, branch_id, bus_id, driver_id, type, route_id, departed_at, arrived_at,
    start_mileage_km, end_mileage_km, fuel_cost, depreciation_per_km, depreciation_amount, updated_at)
  VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, $7::timestamptz, $8::timestamptz, $9, $10, $11, $12, $13, now())
  ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, route_id = EXCLUDED.route_id,
    departed_at = EXCLUDED.departed_at, arrived_at = EXCLUDED.arrived_at,
    start_mileage_km = EXCLUDED.start_mileage_km, end_mileage_km = EXCLUDED.end_mileage_km,
    fuel_cost = EXCLUDED.fuel_cost, depreciation_per_km = EXCLUDED.depreciation_per_km,
    depreciation_amount = EXCLUDED.depreciation_amount, updated_at = now()`;

// A deleted trip stays as a tombstone so a late TripScheduled cannot bring it back.
const DELETED = `
  INSERT INTO branch_report_trips (id, branch_id, bus_id, driver_id, type, departure_at, deleted_at, updated_at)
  VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::timestamptz, now(), now())
  ON CONFLICT (id) DO UPDATE SET deleted_at = COALESCE(branch_report_trips.deleted_at, now()), updated_at = now()`;

@Injectable()
export class TripFactsHandler {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('TripScheduled')
  async tripScheduled(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const trip = tripScheduledPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      SCHEDULED,
      trip.tripId,
      trip.branchId,
      trip.busId,
      trip.driverId,
      trip.type,
      trip.routeId,
      trip.rentalId,
      trip.busPlate,
      trip.originLabel,
      trip.destinationLabel,
      trip.departureAt,
    );
  }

  @OnEvent('TripDeparted')
  async tripDeparted(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const trip = tripDepartedPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      DEPARTED,
      trip.tripId,
      trip.branchId,
      trip.busId,
      trip.driverId,
      trip.departedAt,
      trip.startMileageKm,
    );
  }

  @OnEvent('TripCompleted')
  async tripCompleted(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const trip = tripCompletedPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      COMPLETED,
      trip.tripId,
      trip.branchId,
      trip.busId,
      trip.driverId,
      trip.type,
      trip.routeId,
      trip.departedAt,
      trip.arrivedAt,
      trip.startMileageKm,
      trip.endMileageKm,
      trip.fuelCost,
      trip.depreciationPerKm,
      trip.depreciationAmount,
    );
  }

  @OnEvent('TripDeleted')
  async tripDeleted(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const trip = tripDeletedPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      DELETED,
      trip.tripId,
      trip.branchId,
      trip.busId,
      trip.driverId,
      trip.type,
      trip.departureAt,
    );
  }
}
