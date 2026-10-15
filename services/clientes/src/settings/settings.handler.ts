import { type EventEnvelope, settingsUpdatedPayloadSchema } from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const INSERT_VERSION = `
  INSERT INTO settings_versions (id, depreciation_per_km, rental_rate_per_km, effective_from, created_at)
  VALUES ($1::uuid, $2, $3, $4::date, $5::timestamptz)
  ON CONFLICT (id) DO NOTHING`;

@Injectable()
export class SettingsHandler {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('SettingsUpdated')
  async updated(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const version = settingsUpdatedPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      INSERT_VERSION,
      version.versionId,
      version.depreciationPerKm,
      version.rentalRatePerKm,
      version.effectiveFrom,
      version.createdAt,
    );
  }
}
