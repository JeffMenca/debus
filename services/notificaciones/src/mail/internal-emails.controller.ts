import { PubSubPushGuard } from '@debus/messaging';
import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { type EmailFlushResult, EmailQueue } from './email-queue';

// Called every minute by Cloud Scheduler with the same OIDC identity Pub/Sub push uses.
@ApiExcludeController()
@Controller('internal/emails')
export class InternalEmailsController {
  constructor(private readonly queue: EmailQueue) {}

  @Post('flush')
  @HttpCode(200)
  @UseGuards(PubSubPushGuard)
  flush(): Promise<EmailFlushResult> {
    return this.queue.flush();
  }
}
