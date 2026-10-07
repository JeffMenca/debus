import type { InboxEvent, InboxOutcome, InboxStore, ProcessedEvent } from './inbox-store';

// Structural subset of PrismaClient, so every service can pass its own generated client.
export interface SqlClient {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

export interface SqlTransactional extends SqlClient {
  $transaction<R>(fn: (tx: SqlClient) => Promise<R>): Promise<R>;
}

const INSERT =
  'INSERT INTO processed_events (event_id, type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING';
const SELECT =
  'SELECT event_id AS "eventId", type, processed_at AS "processedAt" FROM processed_events WHERE event_id = $1';

// The mark and the handler share a transaction: a failing handler rolls the mark back and Pub/Sub retries.
export class SqlInboxStore implements InboxStore {
  constructor(private readonly db: SqlTransactional) {}

  runOnce(event: InboxEvent, work: () => Promise<void>): Promise<InboxOutcome> {
    return this.db.$transaction(async (tx) => {
      const inserted = await tx.$executeRawUnsafe(INSERT, event.eventId, event.type);
      if (inserted === 0) return 'duplicate';
      await work();
      return 'processed';
    });
  }

  async findProcessed(eventId: string): Promise<ProcessedEvent | null> {
    const rows = await this.db.$queryRawUnsafe<ProcessedEvent[]>(SELECT, eventId);
    return rows[0] ?? null;
  }
}
