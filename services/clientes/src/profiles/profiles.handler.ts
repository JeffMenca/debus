import { type EventEnvelope, userRegisteredPayloadSchema } from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toProfileRow } from './profile-rules';

// A NIT already held by another profile is dropped, the same rule the registration applies.
const INSERT_PROFILE = `
  INSERT INTO client_profiles (user_id, email, full_name, role, dpi, phone, nit, address)
  VALUES ($1::uuid, $2, $3, $4, $5, $6,
    CASE WHEN EXISTS (SELECT 1 FROM client_profiles WHERE nit = $7) THEN NULL ELSE $7 END, $8)
  ON CONFLICT (user_id) DO NOTHING`;

const INSERT_WALLET = `
  INSERT INTO wallets (client_id) VALUES ($1::uuid)
  ON CONFLICT (client_id) DO NOTHING`;

@Injectable()
export class ProfilesHandler {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('UserRegistered')
  async registered(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const row = toProfileRow(userRegisteredPayloadSchema.parse(payload));
    const sql = tx ?? this.prisma;
    await sql.$executeRawUnsafe(
      INSERT_PROFILE,
      row.userId,
      row.email,
      row.fullName,
      row.role,
      row.dpi,
      row.phone,
      row.nit,
      row.address,
    );
    await sql.$executeRawUnsafe(INSERT_WALLET, row.userId);
  }
}
