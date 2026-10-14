import { z } from 'zod';

/**
 * Events a consumer could not process after every Pub/Sub attempt, read from <service>-dlq-sub.
 * Pub/Sub has no offset nor total, so the list is the oldest `limit` messages and `hasMore`, a
 * hint: a pull may return fewer messages than are waiting.
 */
export const deadLetterListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type DeadLetterListQuery = z.infer<typeof deadLetterListQuerySchema>;

// Envelope fields are null when the message data is not a valid event.
export const deadLetterSchema = z.object({
  messageId: z.string(),
  eventId: z.string().nullable(),
  type: z.string().nullable(),
  correlationId: z.string().nullable(),
  publishedAt: z.iso.datetime(),
  deliveryAttempts: z.number().int().positive().nullable(),
  payload: z.unknown(),
});
export type DeadLetter = z.infer<typeof deadLetterSchema>;

export const deadLetterListSchema = z.object({
  items: z.array(deadLetterSchema),
  hasMore: z.boolean(),
});
export type DeadLetterList = z.infer<typeof deadLetterListSchema>;

export const replayResultSchema = z.object({ outcome: z.enum(['processed', 'duplicate']) });
export type ReplayResult = z.infer<typeof replayResultSchema>;
