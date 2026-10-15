import { type EventEnvelope, rentalPaidPayloadSchema } from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// A paid rental is immutable.
const INSERT_RENTAL = `
  INSERT INTO branch_report_rentals (id, branch_id, client_id, nit, client_name, origin_label,
    destination_label, departure_at, return_at, passengers, distance_km, price, paid_on)
  VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10, $11, $12, $13::date)
  ON CONFLICT (id) DO NOTHING`;

@Injectable()
export class RentalsHandler {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('RentalPaid')
  async paid(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const rental = rentalPaidPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      INSERT_RENTAL,
      rental.rentalId,
      rental.branchId,
      rental.clientId,
      rental.nit,
      rental.clientName,
      rental.originLabel,
      rental.destinationLabel,
      rental.departureAt,
      rental.returnAt,
      rental.passengers,
      rental.distanceKm,
      rental.price,
      rental.paidOn,
    );
  }
}
