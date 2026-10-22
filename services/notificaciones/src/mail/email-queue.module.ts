import { Global, Module } from '@nestjs/common';
import { EmailQueue } from './email-queue';
import { InternalEmailsController } from './internal-emails.controller';

@Global()
@Module({
  controllers: [InternalEmailsController],
  providers: [EmailQueue],
  exports: [EmailQueue],
})
export class EmailQueueModule {}
