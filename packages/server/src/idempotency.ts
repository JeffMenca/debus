import { idempotencyKeySchema } from '@debus/contracts';
import { BadRequestException } from '@nestjs/common';
import { SERVER_MESSAGES } from './messages';

// The Idempotency-Key header of a write: a uuid, or the request is refused before it reaches the service.
export function readIdempotencyKey(
  raw: string | undefined,
  message: string = SERVER_MESSAGES.keyMissing,
): string {
  const parsed = idempotencyKeySchema.safeParse(raw);
  if (!parsed.success) throw new BadRequestException(message);
  return parsed.data;
}
