import { createTransport } from 'nodemailer';
import type { MailSettings } from './mail-settings';
import { SmtpMailer } from './mailer';

export function createSmtpMailer(settings: MailSettings): SmtpMailer {
  return new SmtpMailer(createTransport(settings.transport), settings);
}
