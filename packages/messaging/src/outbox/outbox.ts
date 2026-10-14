import { randomUUID } from 'node:crypto';
import {
  createEnvelope,
  type EventEnvelope,
  type EventType,
  validateEventPayload,
} from '@debus/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SqlClient } from '../inbox/sql-inbox-store';
import { EventPublisher } from '../publishing/event-publisher';
import { OUTBOX_STORE } from '../tokens';
import type { FlushResult, SqlOutboxStore } from './sql-outbox-store';

export interface FlushOptions {
  /** Maximum number of events claimed by this flush. */
  limit?: number;
  /** Time after which no new publication starts and the call returns. */
  budgetMs?: number;
  /** Time a single publication may take before it counts as failed. */
  publishTimeoutMs?: number;
}

// The scheduler call is generous; request-path calls pass { limit: 10, budgetMs: 2000 }.
const DEFAULTS = { limit: 100, budgetMs: 30_000, publishTimeoutMs: 5_000 };
// A live flush must never lose its claim to another one, so the lease covers budget + one publication.
const MIN_LEASE_MS = 60_000;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// Rejects after the delay; the timer is cleared as soon as the publication settles.
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Publication timed out after ${ms} ms`)), ms);
  });
  // A publication abandoned by the timeout may still reject later; that must not surface.
  work.catch(() => undefined);
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** A producer tried to queue a payload its own contract rejects: a bug, never bad user input. */
export class InvalidEventPayloadError extends Error {
  constructor(type: EventType, reason: string) {
    super(`${type} payload breaks its contract: ${reason}`);
    this.name = 'InvalidEventPayloadError';
  }
}

@Injectable()
export class Outbox {
  private readonly logger = new Logger(Outbox.name);

  constructor(
    @Inject(OUTBOX_STORE) private readonly store: SqlOutboxStore,
    private readonly publisher: EventPublisher,
  ) {}

  async add(
    tx: SqlClient,
    type: EventType,
    payload: unknown,
    correlationId?: string,
  ): Promise<EventEnvelope> {
    // Checked here, once, so no producer can queue an event that would only end in a dead-letter.
    const check = validateEventPayload(type, payload);
    if (!check.valid) throw new InvalidEventPayloadError(type, check.reason);
    const envelope = createEnvelope(type, payload, correlationId ?? randomUUID());
    await this.store.enqueue(tx, envelope);
    return envelope;
  }

  /**
   * Publishes pending events outside any database transaction and never throws. A publication that
   * fails or times out stays pending; one that succeeds but is not marked (crash, timeout) may be
   * published again, which the idempotent inbox of every consumer absorbs.
   */
  async flush(options: FlushOptions = {}): Promise<FlushResult> {
    const { limit, budgetMs, publishTimeoutMs } = { ...DEFAULTS, ...options };
    const deadline = Date.now() + budgetMs;
    const result: FlushResult = { published: 0, failed: 0 };
    try {
      const claimed = await this.store.claim(
        limit,
        Math.max(MIN_LEASE_MS, budgetMs + publishTimeoutMs),
      );
      for (const [index, { eventId, envelope }] of claimed.entries()) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          await this.store.release(claimed.slice(index).map((event) => event.eventId));
          break;
        }
        try {
          await withTimeout(
            this.publisher.publish(envelope),
            Math.min(publishTimeoutMs, remaining),
          );
        } catch (error) {
          await this.store.markFailed(eventId, messageOf(error));
          result.failed += 1;
          continue;
        }
        await this.store.markPublished(eventId);
        result.published += 1;
      }
      if (result.failed > 0)
        this.logger.warn(`Outbox kept ${result.failed} events for the next flush`);
    } catch (error) {
      this.logger.error(`Outbox flush failed: ${messageOf(error)}`);
    }
    return result;
  }
}
