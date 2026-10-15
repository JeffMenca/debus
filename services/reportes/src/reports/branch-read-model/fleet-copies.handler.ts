import {
  type EventEnvelope,
  busChangedPayloadSchema,
  driverChangedPayloadSchema,
} from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Events may arrive out of order, so a row is only replaced by a higher version.
const UPSERT_BUS = `
  INSERT INTO branch_report_buses (id, branch_id, plate, brand, model, capacity, operational_status, active,
    assigned_driver_id, mileage_km, version, updated_at)
  VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::uuid, $10, $11, now())
  ON CONFLICT (id) DO UPDATE
    SET branch_id = EXCLUDED.branch_id, plate = EXCLUDED.plate, brand = EXCLUDED.brand,
        model = EXCLUDED.model, capacity = EXCLUDED.capacity,
        operational_status = EXCLUDED.operational_status, active = EXCLUDED.active,
        assigned_driver_id = EXCLUDED.assigned_driver_id, mileage_km = EXCLUDED.mileage_km,
        version = EXCLUDED.version, updated_at = now()
    WHERE branch_report_buses.version < EXCLUDED.version`;

const UPSERT_DRIVER = `
  INSERT INTO branch_report_drivers (id, branch_id, full_name, license_number, license_type,
    license_expires_on, active, version, updated_at)
  VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::date, $7, $8, now())
  ON CONFLICT (id) DO UPDATE
    SET branch_id = EXCLUDED.branch_id, full_name = EXCLUDED.full_name,
        license_number = EXCLUDED.license_number, license_type = EXCLUDED.license_type,
        license_expires_on = EXCLUDED.license_expires_on, active = EXCLUDED.active,
        version = EXCLUDED.version, updated_at = now()
    WHERE branch_report_drivers.version < EXCLUDED.version`;

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

  private async keepBus(payload: unknown, tx?: SqlClient): Promise<void> {
    const bus = busChangedPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      UPSERT_BUS,
      bus.busId,
      bus.branchId,
      bus.plate,
      bus.brand,
      bus.model,
      bus.capacity,
      bus.operationalStatus,
      bus.active,
      bus.assignedDriverId,
      bus.mileageKm,
      bus.version,
    );
  }

  private async keepDriver(payload: unknown, tx?: SqlClient): Promise<void> {
    const driver = driverChangedPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      UPSERT_DRIVER,
      driver.driverId,
      driver.branchId,
      driver.fullName,
      driver.licenseNumber,
      driver.licenseType,
      driver.licenseExpiresOn,
      driver.active,
      driver.version,
    );
  }
}
