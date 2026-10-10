// Per-phase limits for a silent server; the whole send is capped by SEND_DEADLINE_MS in the mailer.
export const SMTP_TIMEOUT_MS = 10_000;

const timeouts = {
  connectionTimeout: SMTP_TIMEOUT_MS,
  greetingTimeout: SMTP_TIMEOUT_MS,
  socketTimeout: SMTP_TIMEOUT_MS,
};

export interface SmtpTransport {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}

export interface MailSettings {
  transport: SmtpTransport;
  from: string;
}

export function loadMailSettings(env: Record<string, string | undefined>): MailSettings {
  if ((env.DEBUS_ENV ?? 'local') === 'local') {
    return {
      transport: {
        host: env.SMTP_HOST ?? 'localhost',
        port: Number(env.SMTP_PORT ?? 1025),
        secure: false,
        ...timeouts,
      },
      from: 'debus <no-responder@debus.local>',
    };
  }
  if (!env.SMTP_USER || !env.SMTP_PASSWORD) {
    throw new Error('SMTP_USER and SMTP_PASSWORD are required');
  }
  return {
    transport: {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      ...timeouts,
    },
    // Gmail only sends as the authenticated account.
    from: `debus <${env.SMTP_USER}>`,
  };
}
