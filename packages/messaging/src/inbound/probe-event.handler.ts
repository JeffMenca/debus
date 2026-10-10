import type { EventEnvelope } from '@debus/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from './on-event.decorator';

// Diagnostic: being recorded in the inbox is the whole effect.
@Injectable()
export class ProbeEventHandler {
  private readonly logger = new Logger(ProbeEventHandler.name);

  @OnEvent('ProbeSent')
  handle(_payload: unknown, envelope: EventEnvelope): void {
    this.logger.log(`Probe ${envelope.eventId} received`);
  }
}
