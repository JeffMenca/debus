import { Global, Module } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { loadMailSettings } from './mail-settings';
import { Mailer, SmtpMailer } from './mailer';

@Global()
@Module({
  providers: [
    {
      provide: Mailer,
      useFactory: () => {
        const settings = loadMailSettings(process.env);
        return new SmtpMailer(createTransport(settings.transport), settings);
      },
    },
  ],
  exports: [Mailer],
})
export class MailModule {}
