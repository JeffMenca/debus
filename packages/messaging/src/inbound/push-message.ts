import { type EventEnvelope, eventEnvelopeSchema } from '@debus/contracts';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const pushBodySchema = z.object({
  message: z.object({
    data: z.string(),
    attributes: z.record(z.string(), z.string()).optional(),
  }),
});

export function decodePushMessage(body: unknown): EventEnvelope {
  const push = pushBodySchema.safeParse(body);
  if (!push.success) throw new BadRequestException('Invalid push request');
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(push.data.message.data, 'base64').toString('utf8'));
  } catch {
    throw new BadRequestException('Push data is not JSON');
  }
  const envelope = eventEnvelopeSchema.safeParse(decoded);
  if (!envelope.success) throw new BadRequestException('Invalid event envelope');
  return envelope.data;
}
