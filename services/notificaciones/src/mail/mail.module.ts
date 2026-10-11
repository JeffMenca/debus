import { Global, Module } from '@nestjs/common';
import { createSmtpMailer } from './create-smtp-mailer';
import { loadMailSettings } from './mail-settings';
import { Mailer } from './mailer';

@Global()
@Module({
  providers: [
    { provide: Mailer, useFactory: () => createSmtpMailer(loadMailSettings(process.env)) },
  ],
  exports: [Mailer],
})
export class MailModule {}
