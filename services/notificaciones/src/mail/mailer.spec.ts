import { INBOX_TRANSACTION_TIMEOUT_MS } from '@debus/messaging';
import { SEND_DEADLINE_MS, SmtpMailer } from './mailer';

const settings = {
  transport: {
    host: 'x',
    port: 1,
    secure: false,
    connectionTimeout: 1,
    greetingTimeout: 1,
    socketTimeout: 1,
  },
  from: 'debus <d@x.com>',
};

describe('SmtpMailer', () => {
  it('sends from the configured address', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'm' });
    const mailer = new SmtpMailer({ sendMail }, settings);

    await mailer.send({ to: 'ana@correo.com', subject: 'Hola', html: '<p>Hola</p>', text: 'Hola' });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'debus <d@x.com>',
      to: 'ana@correo.com',
      subject: 'Hola',
      html: '<p>Hola</p>',
      text: 'Hola',
    });
  });

  it('lets SMTP failures propagate so Pub/Sub retries', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('timeout'));
    const mailer = new SmtpMailer({ sendMail }, settings);

    await expect(
      mailer.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' }),
    ).rejects.toThrow('timeout');
  });

  describe('total deadline', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const message = { to: 'a@b.com', subject: 's', html: 'h', text: 't' };

    it('ends before the inbox transaction that wraps the handler', () => {
      expect(SEND_DEADLINE_MS).toBe(25_000);
      expect(SEND_DEADLINE_MS).toBeLessThan(INBOX_TRANSACTION_TIMEOUT_MS);
    });

    it('fails a send that never finishes so the event is retried', async () => {
      const sendMail = jest.fn().mockReturnValue(new Promise(() => undefined));
      const result = new SmtpMailer({ sendMail }, settings).send(message);
      const assertion = expect(result).rejects.toThrow('Email was not sent within 25000 ms');

      await jest.advanceTimersByTimeAsync(SEND_DEADLINE_MS);

      await assertion;
    });

    it('does not fail a send that finishes in time and leaves no timer behind', async () => {
      const sendMail = jest.fn().mockResolvedValue({ messageId: 'm' });

      await new SmtpMailer({ sendMail }, settings).send(message);

      expect(jest.getTimerCount()).toBe(0);
    });

    it('clears the timer when the send fails', async () => {
      const sendMail = jest.fn().mockRejectedValue(new Error('refused'));

      await expect(new SmtpMailer({ sendMail }, settings).send(message)).rejects.toThrow('refused');

      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
