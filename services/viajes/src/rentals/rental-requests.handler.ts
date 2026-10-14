import { type EventEnvelope, rentalPaidPayloadSchema } from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// A repeated event changes nothing: the first one wins, and an assigned rental is never reset.
const INSERT_REQUEST = `
  INSERT INTO rental_requests (id, branch_id, client_name, nit, origin_label, destination_label,
    departure_at, return_at, passengers, distance_km, price, status, updated_at)
  VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9, $10, $11, 'PENDING', now())
  ON CONFLICT (id) DO NOTHING`;

@Injectable()
export class RentalRequestsHandler {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('RentalPaid')
  async paid(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const rental = rentalPaidPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      INSERT_REQUEST,
      rental.rentalId,
      rental.branchId,
      rental.clientName,
      rental.nit,
      rental.originLabel,
      rental.destinationLabel,
      rental.departureAt,
      rental.returnAt,
      rental.passengers,
      rental.distanceKm,
      rental.price,
    );
  }
}
