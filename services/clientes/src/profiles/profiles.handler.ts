import {
  type EventEnvelope,
  userRegisteredPayloadSchema,
  userUpdatedPayloadSchema,
} from '@debus/contracts';
import { OnEvent, Outbox, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  type NewProfile,
  toProfileRow,
  toProfileUpdated,
  toRecoveredProfileRow,
} from './profile-rules';

// A NIT already held by another profile is dropped, the same rule the registration applies.
// Only a profile created (or completed) now returns a row, so a repeated event announces nothing.
const insertProfile = (onConflict: string) => `
  INSERT INTO client_profiles (user_id, email, full_name, role, dpi, phone, nit, address, account_version)
  VALUES ($1::uuid, $2, $3, $4, $5, $6,
    CASE WHEN EXISTS (SELECT 1 FROM client_profiles WHERE nit = $7) THEN NULL ELSE $7 END, $8, $9)
  ${onConflict}
  RETURNING nit, updated_at`;

// A republished account may have created an empty profile first; the registration then fills in
// what the client entered, but never overwrites a profile that already holds it. A registration newer
// than that first row also says the account is active now.
const INSERT_PROFILE = insertProfile(`
  ON CONFLICT (user_id) DO UPDATE SET
    dpi = COALESCE(client_profiles.dpi, EXCLUDED.dpi),
    phone = COALESCE(client_profiles.phone, EXCLUDED.phone),
    address = COALESCE(client_profiles.address, EXCLUDED.address),
    nit = COALESCE(client_profiles.nit, EXCLUDED.nit),
    active = client_profiles.active OR EXCLUDED.account_version > client_profiles.account_version,
    account_version = GREATEST(client_profiles.account_version, EXCLUDED.account_version),
    updated_at = now()
  WHERE (client_profiles.dpi IS NULL AND EXCLUDED.dpi IS NOT NULL)
    OR EXCLUDED.account_version > client_profiles.account_version`);

const RECOVER_PROFILE = insertProfile('ON CONFLICT (user_id) DO NOTHING');

// Events may arrive out of order, so a profile only takes what a newer version of the account says.
const FOLLOW_ACCOUNT = `
  UPDATE client_profiles profile
  SET email = $2, full_name = $3, active = $4, account_version = $5, updated_at = now()
  FROM (SELECT user_id, full_name FROM client_profiles WHERE user_id = $1::uuid FOR UPDATE) previous
  WHERE profile.user_id = previous.user_id AND profile.account_version < $5
  RETURNING profile.nit, profile.updated_at, previous.full_name AS previous_name`;

const INSERT_WALLET = `
  INSERT INTO wallets (client_id) VALUES ($1::uuid)
  ON CONFLICT (client_id) DO NOTHING`;

@Injectable()
export class ProfilesHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: Outbox,
  ) {}

  @OnEvent('UserRegistered')
  async registered(payload: unknown, envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const row = toProfileRow(userRegisteredPayloadSchema.parse(payload));
    await this.create(INSERT_PROFILE, row, envelope, tx ?? this.prisma);
  }

  // Accounts whose registration never reached clientes come back through the republished account,
  // and every profile keeps the name, the email and the state of its account.
  @OnEvent('UserUpdated')
  async updated(payload: unknown, envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const account = userUpdatedPayloadSchema.parse(payload);
    const sql = tx ?? this.prisma;
    await this.create(RECOVER_PROFILE, toRecoveredProfileRow(account), envelope, sql);
    const [followed] = await sql.$queryRawUnsafe<
      { nit: string | null; updated_at: Date; previous_name: string }[]
    >(
      FOLLOW_ACCOUNT,
      account.userId,
      account.email,
      account.fullName,
      account.active,
      account.version,
    );
    // ventas names the tickets with its copy of the name.
    if (followed && followed.previous_name !== account.fullName) {
      await this.outbox.add(
        sql,
        'ProfileUpdated',
        toProfileUpdated({
          userId: account.userId,
          fullName: account.fullName,
          nit: followed.nit,
          updatedAt: followed.updated_at,
        }),
        envelope.correlationId,
      );
    }
  }

  private async create(
    insertSql: string,
    row: NewProfile,
    envelope: EventEnvelope,
    sql: SqlClient,
  ): Promise<void> {
    const [created] = await sql.$queryRawUnsafe<{ nit: string | null; updated_at: Date }[]>(
      insertSql,
      row.userId,
      row.email,
      row.fullName,
      row.role,
      row.dpi,
      row.phone,
      row.nit,
      row.address,
      row.accountVersion,
    );
    await sql.$executeRawUnsafe(INSERT_WALLET, row.userId);
    if (!created) return;
    await this.outbox.add(
      sql,
      'ProfileUpdated',
      toProfileUpdated({ ...row, nit: created.nit, updatedAt: created.updated_at }),
      envelope.correlationId,
    );
  }
}
