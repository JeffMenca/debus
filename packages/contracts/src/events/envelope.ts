import { z } from 'zod';
import { EVENT_TYPES, type EventType } from './registry';

export const eventEnvelopeSchema = z.object({
  eventId: z.uuid(),
  type: z.enum(EVENT_TYPES as [EventType, ...EventType[]]),
  version: z.number().int().positive(),
  occurredAt: z.iso.datetime(),
  correlationId: z.string().min(1),
  payload: z.unknown(),
});
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export const probeEmittedPayloadSchema = z.object({ requestedAt: z.iso.datetime() });

export function createEnvelope(
  type: EventType,
  payload: unknown,
  correlationId: string,
  version = 1,
): EventEnvelope {
  return {
    eventId: globalThis.crypto.randomUUID(),
    type,
    version,
    occurredAt: new Date().toISOString(),
    correlationId,
    payload,
  };
}
