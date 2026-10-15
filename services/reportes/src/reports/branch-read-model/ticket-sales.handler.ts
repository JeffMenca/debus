import { type EventEnvelope, ticketSoldPayloadSchema } from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// A sale is immutable; a refund removes the trip from the reports, not the sale.
const INSERT_SALE = `
  INSERT INTO branch_report_ticket_sales (id, trip_id, route_id, branch_id, bus_id, origin_label,
    destination_label, departure_at, channel, seats, total, paid_on, sold_at)
  VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8::timestamptz, $9, $10, $11, $12::date, $13::timestamptz)
  ON CONFLICT (id) DO NOTHING`;

@Injectable()
export class TicketSalesHandler {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('TicketSold')
  async sold(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const sale = ticketSoldPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      INSERT_SALE,
      sale.ticketId,
      sale.tripId,
      sale.routeId,
      sale.branchId,
      sale.busId,
      sale.originLabel,
      sale.destinationLabel,
      sale.departureAt,
      sale.channel,
      sale.seats.length,
      sale.total,
      sale.paidOn,
      sale.soldAt,
    );
  }
}
