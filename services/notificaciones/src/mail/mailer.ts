import type { MailSettings } from './mail-settings';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}

// Structural subset of a Nodemailer transporter, so tests can pass a double.
export interface MailTransport {
  sendMail(options: MailMessage & { from: string }): Promise<unknown>;
}

// Nodemailer timeouts are per phase; this caps how long the handler waits, below the inbox
// transaction (30 s). It does not cancel the send: a server that accepts the message after the
// deadline still delivers it, and the retry may then send a second copy. That is rare (Gmail
// answers in seconds) and the copy is harmless for these emails, so it is accepted.
export const SEND_DEADLINE_MS = 25_000;

export class SmtpMailer extends Mailer {
  constructor(
    private readonly transport: MailTransport,
    private readonly settings: MailSettings,
  ) {
    super();
  }

  async send(message: MailMessage): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Email was not sent within ${SEND_DEADLINE_MS} ms`)),
        SEND_DEADLINE_MS,
      );
    });
    try {
      await Promise.race([
        this.transport.sendMail({ from: this.settings.from, ...message }),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
