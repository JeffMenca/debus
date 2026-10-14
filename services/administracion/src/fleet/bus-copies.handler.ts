import { type EventEnvelope, busChangedPayloadSchema } from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Events may arrive out of order, so a row is only replaced by a higher version.
const UPSERT_BUS = `
  INSERT INTO bus_copies (id, branch_id, plate, active, version, updated_at)
  VALUES ($1::uuid, $2::uuid, $3, $4, $5, now())
  ON CONFLICT (id) DO UPDATE
    SET branch_id = EXCLUDED.branch_id, plate = EXCLUDED.plate, active = EXCLUDED.active,
        version = EXCLUDED.version, updated_at = now()
    WHERE bus_copies.version < EXCLUDED.version`;

@Injectable()
export class BusCopiesHandler {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('BusAdded')
  added(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.keep(payload, tx);
  }

  @OnEvent('BusUpdated')
  updated(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.keep(payload, tx);
  }

  @OnEvent('BusDeactivated')
  deactivated(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.keep(payload, tx);
  }

  private async keep(payload: unknown, tx?: SqlClient): Promise<void> {
    const bus = busChangedPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      UPSERT_BUS,
      bus.busId,
      bus.branchId,
      bus.plate,
      bus.active,
      bus.version,
    );
  }
}
