import type {
  InboxEvent,
  InboxOutcome,
  InboxStore,
  InboxWork,
  ProcessedEvent,
} from './inbox-store';

export class InMemoryInboxStore implements InboxStore {
  private readonly processed = new Map<string, ProcessedEvent>();

  async runOnce(event: InboxEvent, work: InboxWork): Promise<InboxOutcome> {
    if (this.processed.has(event.eventId)) return 'duplicate';
    this.processed.set(event.eventId, {
      eventId: event.eventId,
      type: event.type,
      processedAt: new Date(),
    });
    try {
      await work(undefined);
      return 'processed';
    } catch (error) {
      this.processed.delete(event.eventId);
      throw error;
    }
  }

  async findProcessed(eventId: string): Promise<ProcessedEvent | null> {
    return this.processed.get(eventId) ?? null;
  }
}
