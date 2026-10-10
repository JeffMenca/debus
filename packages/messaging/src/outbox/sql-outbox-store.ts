import type { EventEnvelope } from '@debus/contracts';
import type { SqlClient } from '../inbox/sql-inbox-store';

export interface FlushResult {
  published: number;
  failed: number;
}

export interface ClaimedEvent {
  eventId: string;
  envelope: EventEnvelope;
}

export const OUTBOX_TABLE_SQL = `CREATE TABLE "outbox" (
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "envelope" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "claimed_until" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("event_id")
);
CREATE INDEX "outbox_pending_idx" ON "outbox"("created_at") WHERE "published_at" IS NULL;`;

const INSERT = 'INSERT INTO outbox (event_id, type, envelope) VALUES ($1, $2, $3::jsonb)';
// One statement: rows locked by a concurrent claim are skipped, so two flushes never get the same event.
const CLAIM = `WITH claimed AS (
  UPDATE outbox SET claimed_until = now() + make_interval(secs => $2::double precision)
  WHERE event_id IN (
    SELECT event_id FROM outbox
    WHERE published_at IS NULL AND (claimed_until IS NULL OR claimed_until < now())
    ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED
  )
  RETURNING event_id, envelope, created_at
) SELECT event_id AS "eventId", envelope FROM claimed ORDER BY created_at`;
// Delivered payloads (links, tokens) must not stay in the table; the metadata keeps the trace.
const MARK_PUBLISHED =
  "UPDATE outbox SET published_at = now(), claimed_until = NULL, envelope = envelope - 'payload' WHERE event_id = $1";
const MARK_FAILED =
  'UPDATE outbox SET attempts = attempts + 1, last_error = $2, claimed_until = NULL WHERE event_id = $1';
const RELEASE = 'UPDATE outbox SET claimed_until = NULL WHERE event_id = ANY($1::text[])';

interface ClaimedRow {
  eventId: string;
  envelope: EventEnvelope | string;
}

// Every statement is short and none spans a publication: publishing happens between claim and mark.
export class SqlOutboxStore {
  constructor(private readonly db: SqlClient) {}

  async enqueue(tx: SqlClient, envelope: EventEnvelope): Promise<void> {
    await tx.$executeRawUnsafe(INSERT, envelope.eventId, envelope.type, JSON.stringify(envelope));
  }

  // The lease hides the events from other flushes; it expires by itself if this process dies.
  async claim(limit: number, leaseMs: number): Promise<ClaimedEvent[]> {
    const rows = await this.db.$queryRawUnsafe<ClaimedRow[]>(CLAIM, limit, leaseMs / 1000);
    return rows.map((row) => ({
      eventId: row.eventId,
      envelope: typeof row.envelope === 'string' ? JSON.parse(row.envelope) : row.envelope,
    }));
  }

  async markPublished(eventId: string): Promise<void> {
    await this.db.$executeRawUnsafe(MARK_PUBLISHED, eventId);
  }

  async markFailed(eventId: string, error: string): Promise<void> {
    await this.db.$executeRawUnsafe(MARK_FAILED, eventId, error);
  }

  async release(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    await this.db.$executeRawUnsafe(RELEASE, eventIds);
  }
}
