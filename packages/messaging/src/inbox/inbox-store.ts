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

export interface InboxStore {
  runOnce(event: InboxEvent, work: () => Promise<void>): Promise<InboxOutcome>;
  findProcessed(eventId: string): Promise<ProcessedEvent | null>;
}
