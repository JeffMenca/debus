import type { SqlClient } from './sql-inbox-store';

export interface ProcessedEvent {
  eventId: string;
  type: string;
  processedAt: Date;
}

export interface InboxEvent {
  eventId: string;
  type: string;
}

export type InboxOutcome = 'processed' | 'duplicate';

// The transaction client lets handlers write in the same transaction as the processed mark.
// Stores without a database pass undefined.
export type InboxWork = (tx: SqlClient | undefined) => Promise<void>;

export interface InboxStore {
  runOnce(event: InboxEvent, work: InboxWork): Promise<InboxOutcome>;
  findProcessed(eventId: string): Promise<ProcessedEvent | null>;
}
