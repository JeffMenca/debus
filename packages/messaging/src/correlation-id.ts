import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { CORRELATION_HEADER } from '@debus/contracts';

// Used as pino-http genReqId so every log line and outgoing call shares one id.
export function correlationIdFor(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[CORRELATION_HEADER];
  const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
  req.headers[CORRELATION_HEADER] = id;
  res.setHeader(CORRELATION_HEADER, id);
  return id;
}
