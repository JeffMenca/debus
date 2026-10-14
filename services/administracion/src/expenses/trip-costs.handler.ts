import { type EventEnvelope, tripCompletedPayloadSchema } from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// The primary key makes a repeated TripCompleted harmless, even with a new event id.
const INSERT_COST = `
  INSERT INTO trip_costs (trip_id, branch_id, bus_id, trip_type, arrived_at, distance_km, fuel_cost,
    depreciation_per_km, depreciation_amount, driver_pay)
  VALUES ($1::uuid, $2::uuid, $3::uuid, $4::"TripCostType", $5::timestamptz, $6, $7, $8, $9, $10)
  ON CONFLICT (trip_id) DO NOTHING`;

// Fuel and depreciation are expenses of the branch; the driver's pay is kept but is not an expense.
@Injectable()
export class TripCostsHandler {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('TripCompleted')
  async completed(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const trip = tripCompletedPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      INSERT_COST,
      trip.tripId,
      trip.branchId,
      trip.busId,
      trip.type,
      trip.arrivedAt,
      trip.endMileageKm - trip.startMileageKm,
      trip.fuelCost,
      trip.depreciationPerKm,
      trip.depreciationAmount,
      trip.driverPay,
    );
  }
}
