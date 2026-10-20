import type { BackendService } from '@debus/contracts';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { SERVER_MESSAGES } from './messages';

export class ServiceUnavailableError extends ServiceUnavailableException {
  constructor(message: string = SERVER_MESSAGES.upstream) {
    super(message);
  }
}

// The circuit towards a peer is open: the call never left, so nothing was sent or changed there.
export class CircuitOpenError extends ServiceUnavailableError {
  constructor(
    readonly target: BackendService,
    readonly retryAt: Date,
  ) {
    super(SERVER_MESSAGES.paused);
  }
}

// A 4xx keeps its status and the peer's message, so the caller can turn it into its own rule.
export class ServiceRejectedError extends HttpException {
  constructor(
    status: number,
    readonly body: unknown,
  ) {
    super((body as { message?: string } | null)?.message ?? SERVER_MESSAGES.generic, status);
  }
}
