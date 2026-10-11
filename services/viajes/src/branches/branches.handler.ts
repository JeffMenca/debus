import { type EventEnvelope, branchChangedPayloadSchema } from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Events may arrive out of order, so a row is only replaced by a higher version.
const UPSERT_BRANCH = `
  INSERT INTO branches (id, code, name, active, version, updated_at)
  VALUES ($1::uuid, $2, $3, $4, $5, now())
  ON CONFLICT (id) DO UPDATE
    SET code = EXCLUDED.code, name = EXCLUDED.name, active = EXCLUDED.active,
        version = EXCLUDED.version, updated_at = now()
    WHERE branches.version < EXCLUDED.version`;

@Injectable()
export class BranchesHandler {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('BranchCreated')
  created(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.keep(payload, tx);
  }

  @OnEvent('BranchUpdated')
  updated(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.keep(payload, tx);
  }

  private async keep(payload: unknown, tx?: SqlClient): Promise<void> {
    const branch = branchChangedPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      UPSERT_BRANCH,
      branch.branchId,
      branch.code,
      branch.name,
      branch.active,
      branch.version,
    );
  }
}
