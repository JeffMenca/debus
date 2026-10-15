import { type EventEnvelope, settingsUpdatedPayloadSchema } from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// A settings version never changes, so a repeated one is ignored.
const INSERT_RATE = `
  INSERT INTO branch_report_depreciation_rates (id, depreciation_per_km, effective_from, created_at)
  VALUES ($1::uuid, $2, $3::date, $4::timestamptz)
  ON CONFLICT (id) DO NOTHING`;

@Injectable()
export class SettingsHandler {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('SettingsUpdated')
  async updated(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const version = settingsUpdatedPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      INSERT_RATE,
      version.versionId,
      version.depreciationPerKm,
      version.effectiveFrom,
      version.createdAt,
    );
  }
}
