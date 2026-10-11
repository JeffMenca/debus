import { createSmtpMailer } from './create-smtp-mailer';
import { loadMailSettings } from './mail-settings';
import { SmtpMailer } from './mailer';

describe('createSmtpMailer', () => {
  it('builds the SMTP mailer for the given settings', () => {
    expect(createSmtpMailer(loadMailSettings({ DEBUS_ENV: 'local' }))).toBeInstanceOf(SmtpMailer);
  });
});
