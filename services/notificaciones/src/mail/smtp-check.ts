import { renderEmailLayout } from './email-layout';
import { loadMailSettings, type MailSettings } from './mail-settings';
import type { Mailer } from './mailer';
import { createSmtpMailer } from './create-smtp-mailer';

export interface SmtpCheckResult {
  ok: boolean;
  message: string;
}

type Env = Record<string, string | undefined>;
type Secrets = readonly (string | undefined)[];
type MailerFactory = (settings: MailSettings) => Mailer;

const SUBJECT = 'Prueba de correo de debus';
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const CONNECTION_CODES = new Set([
  'ECONNECTION',
  'ETIMEDOUT',
  'ESOCKET',
  'ECONNREFUSED',
  'ENOTFOUND',
]);
const AUTH_REJECTED = 535;

export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at < 1) return '***';
  return `${at === 1 ? '' : address[0]}***${address.slice(at)}`;
}

// GitHub workflow commands end at the first line break and treat % as an escape, so both are encoded.
export function escapeWorkflowCommand(message: string): string {
  return message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

// Hides the given secrets and, for whatever else a server echoes back, any address but its first letter and domain.
export function redact(text: string, secrets: Secrets): string {
  const known = secrets
    .filter((secret): secret is string => Boolean(secret))
    .sort((a, b) => b.length - a.length);
  const hidden = known.reduce((result, secret) => result.split(secret).join('***'), text);
  return hidden.replace(EMAIL_PATTERN, maskEmail);
}

// Sends one real email through the production configuration and explains, for the team, why it failed.
// The result never contains credentials or full addresses.
export async function runSmtpCheck(
  env: Env,
  mailerFor: MailerFactory = createSmtpMailer,
): Promise<SmtpCheckResult> {
  const recipient = env.BOOTSTRAP_ADMIN_EMAIL;
  if (!recipient) {
    return fail('Falta la variable BOOTSTRAP_ADMIN_EMAIL: no hay a quién enviar la prueba.');
  }
  const secrets = [env.SMTP_USER, env.SMTP_PASSWORD, recipient];

  let settings: MailSettings;
  try {
    settings = loadMailSettings(env);
  } catch {
    return fail('Faltan SMTP_USER o SMTP_PASSWORD en la configuración de GitHub.');
  }
  const { host, port } = settings.transport;

  try {
    await mailerFor(settings).send({ to: recipient, subject: SUBJECT, ...testEmail() });
  } catch (error) {
    return fail(explain(error, `${host}:${port}`, secrets));
  }
  return {
    ok: true,
    message: `Enviado correctamente a ${maskEmail(recipient)} mediante ${host}:${port}. Revisa la bandeja de entrada y la carpeta de spam.`,
  };
}

function fail(message: string): SmtpCheckResult {
  return { ok: false, message };
}

function testEmail(): { html: string; text: string } {
  return renderEmailLayout({
    preheader: 'El envío de correos de debus funciona.',
    heading: SUBJECT,
    paragraphs: [
      'Si lees este mensaje, el envío de correos de debus funciona con la configuración de producción.',
    ],
  });
}

function explain(error: unknown, server: string, secrets: Secrets): string {
  const { code, responseCode, message } = error as {
    code?: string;
    responseCode?: number;
    message?: string;
  };
  if (code === 'EAUTH' || responseCode === AUTH_REJECTED) {
    return 'El servidor rechazó el inicio de sesión: la contraseña de aplicación es incorrecta o la verificación en 2 pasos no está activa en la cuenta de correo.';
  }
  if (code && CONNECTION_CODES.has(code)) {
    return `No hay conexión con ${server} (${code}). Revisa que el puerto no esté bloqueado y que el servidor responda.`;
  }
  const detail = redact(message ?? String(error), secrets);
  const codes = [code, responseCode].filter(Boolean).join(' ');
  return `El envío falló${codes ? ` (${codes})` : ''}: ${detail}`;
}
