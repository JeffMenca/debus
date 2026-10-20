import { type EventEnvelope, profileUpdatedPayloadSchema } from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { linkableNit } from './client-rules';

// An older or repeated event changes no row, so the copy never goes back to a previous NIT.
const COPY_NIT = `
  INSERT INTO client_nits (client_id, nit, full_name, updated_at)
  VALUES ($1::uuid, $2, $3, $4::timestamptz)
  ON CONFLICT (client_id) DO UPDATE
    SET nit = EXCLUDED.nit, full_name = EXCLUDED.full_name, updated_at = EXCLUDED.updated_at
    WHERE client_nits.updated_at < EXCLUDED.updated_at`;

// Links, never copies: the counter sales made with the NIT before the account existed become
// part of the client's history. Sales already linked to someone stay with them.
const LINK_COUNTER_SALES = `
  UPDATE tickets SET client_id = $1::uuid
  WHERE nit = $2 AND client_id IS NULL AND channel = 'COUNTER'`;

@Injectable()
export class ClientsHandler {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('ProfileUpdated')
  async profileUpdated(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const profile = profileUpdatedPayloadSchema.parse(payload);
    const sql = tx ?? this.prisma;
    const copied = await sql.$executeRawUnsafe(
      COPY_NIT,
      profile.clientId,
      profile.nit,
      profile.fullName,
      profile.updatedAt,
    );
    if (copied === 0 || !linkableNit(profile.nit)) return;
    await sql.$executeRawUnsafe(LINK_COUNTER_SALES, profile.clientId, profile.nit);
  }
}
