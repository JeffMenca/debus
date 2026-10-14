import {
  type EventEnvelope,
  busChangedPayloadSchema,
  driverChangedPayloadSchema,
  routeChangedPayloadSchema,
  routeDeletedPayloadSchema,
} from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Events may arrive out of order, so a row is only replaced by a higher version.
const UPSERT_BUS = `
  INSERT INTO bus_copies (id, branch_id, plate, capacity, operational_status, active, assigned_driver_id, version, mileage_km, updated_at)
  VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::uuid, $8, $9, now())
  ON CONFLICT (id) DO UPDATE
    SET branch_id = EXCLUDED.branch_id, plate = EXCLUDED.plate, capacity = EXCLUDED.capacity,
        operational_status = EXCLUDED.operational_status, active = EXCLUDED.active,
        assigned_driver_id = EXCLUDED.assigned_driver_id, version = EXCLUDED.version,
        mileage_km = EXCLUDED.mileage_km, updated_at = now()
    WHERE bus_copies.version < EXCLUDED.version`;

const UPSERT_DRIVER = `
  INSERT INTO driver_copies (id, branch_id, full_name, license_expires_on, base_salary, active, version, updated_at)
  VALUES ($1::uuid, $2::uuid, $3, $4::date, $5, $6, $7, now())
  ON CONFLICT (id) DO UPDATE
    SET branch_id = EXCLUDED.branch_id, full_name = EXCLUDED.full_name,
        license_expires_on = EXCLUDED.license_expires_on, base_salary = EXCLUDED.base_salary,
        active = EXCLUDED.active, version = EXCLUDED.version, updated_at = now()
    WHERE driver_copies.version < EXCLUDED.version`;

// A deleted route stays as a tombstone, so a late RouteCreated or RouteUpdated cannot bring it back.
const UPSERT_ROUTE = `
  INSERT INTO route_copies (id, origin_branch_id, destination_branch_id, distance_km, ticket_price, active, version, updated_at)
  VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, now())
  ON CONFLICT (id) DO UPDATE
    SET origin_branch_id = EXCLUDED.origin_branch_id, destination_branch_id = EXCLUDED.destination_branch_id,
        distance_km = EXCLUDED.distance_km, ticket_price = EXCLUDED.ticket_price, active = EXCLUDED.active,
        version = EXCLUDED.version, updated_at = now()
    WHERE route_copies.version < EXCLUDED.version AND NOT route_copies.deleted`;

const DELETE_ROUTE = `
  INSERT INTO route_copies (id, origin_branch_id, destination_branch_id, distance_km, ticket_price, active, deleted, version, updated_at)
  VALUES ($1::uuid, $2::uuid, $3::uuid, 0, 0, false, true, 0, now())
  ON CONFLICT (id) DO UPDATE SET deleted = true, active = false, updated_at = now()`;

@Injectable()
export class FleetCopiesHandler {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('BusAdded')
  busAdded(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.keepBus(payload, tx);
  }

  @OnEvent('BusUpdated')
  busUpdated(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.keepBus(payload, tx);
  }

  @OnEvent('BusDeactivated')
  busDeactivated(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.keepBus(payload, tx);
  }

  @OnEvent('DriverAdded')
  driverAdded(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.keepDriver(payload, tx);
  }

  @OnEvent('DriverUpdated')
  driverUpdated(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.keepDriver(payload, tx);
  }

  @OnEvent('RouteCreated')
  routeCreated(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.keepRoute(payload, tx);
  }

  @OnEvent('RouteUpdated')
  routeUpdated(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.keepRoute(payload, tx);
  }

  @OnEvent('RouteDeleted')
  async routeDeleted(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const route = routeDeletedPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      DELETE_ROUTE,
      route.routeId,
      route.originBranchId ?? null,
      route.destinationBranchId ?? null,
    );
  }

  private async keepBus(payload: unknown, tx?: SqlClient): Promise<void> {
    const bus = busChangedPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      UPSERT_BUS,
      bus.busId,
      bus.branchId,
      bus.plate,
      bus.capacity,
      bus.operationalStatus,
      bus.active,
      bus.assignedDriverId,
      bus.version,
      bus.mileageKm,
    );
  }

  private async keepDriver(payload: unknown, tx?: SqlClient): Promise<void> {
    const driver = driverChangedPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      UPSERT_DRIVER,
      driver.driverId,
      driver.branchId,
      driver.fullName,
      driver.licenseExpiresOn,
      driver.baseSalary,
      driver.active,
      driver.version,
    );
  }

  private async keepRoute(payload: unknown, tx?: SqlClient): Promise<void> {
    const route = routeChangedPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      UPSERT_ROUTE,
      route.routeId,
      route.originBranchId,
      route.destinationBranchId,
      route.distanceKm,
      route.ticketPrice,
      route.active,
      route.version,
    );
  }
}
