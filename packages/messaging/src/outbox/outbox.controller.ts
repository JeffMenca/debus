import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PubSubPushGuard } from '../inbound/pubsub-push.guard';
import { Outbox } from './outbox';
import type { FlushResult } from './sql-outbox-store';

// Called every minute by Cloud Scheduler with the same OIDC identity Pub/Sub push uses.
@ApiExcludeController()
@Controller('outbox')
export class OutboxController {
  constructor(private readonly outbox: Outbox) {}

  @Post('flush')
  @HttpCode(200)
  @UseGuards(PubSubPushGuard)
  flush(): Promise<FlushResult> {
    return this.outbox.flush();
  }
}
