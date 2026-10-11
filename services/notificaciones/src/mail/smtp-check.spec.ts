import type { Mailer } from './mailer';
import { escapeWorkflowCommand, maskEmail, redact, runSmtpCheck } from './smtp-check';

const PASSWORD = 'abcdefghijklmnop';
const USER = 'debus.notificaciones@gmail.com';
const ADMIN = 'primer.admin@universidad.edu.gt';
const production = {
  DEBUS_ENV: 'production',
  SMTP_USER: USER,
  SMTP_PASSWORD: PASSWORD,
  BOOTSTRAP_ADMIN_EMAIL: ADMIN,
};

function failingWith(error: Error): () => Mailer {
  const send = jest.fn().mockRejectedValue(error);
  return () => ({ send }) as Mailer;
}

function smtpError(message: string, fields: Record<string, unknown>): Error {
  return Object.assign(new Error(message), fields);
}

describe('maskEmail', () => {
  it('keeps the first letter and the domain only', () => {
    expect(maskEmail('primer.admin@universidad.edu.gt')).toBe('p***@universidad.edu.gt');
  });

  it('hides a one-letter local part completely', () => {
    expect(maskEmail('a@b.com')).toBe('***@b.com');
  });

  it('masks a value that is not an address', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });
});

describe('escapeWorkflowCommand', () => {
  it('escapes percent signs and line breaks so a multi-line message stays one annotation', () => {
    expect(escapeWorkflowCommand('100% bad\r\nsecond line\nthird')).toBe(
      '100%25 bad%0D%0Asecond line%0Athird',
    );
  });

  it('escapes the percent sign first so the replacements are not escaped twice', () => {
    expect(escapeWorkflowCommand('%0A')).toBe('%250A');
  });

  it('leaves a plain message unchanged', () => {
    expect(escapeWorkflowCommand('No hay conexión con localhost:1 (ESOCKET).')).toBe(
      'No hay conexión con localhost:1 (ESOCKET).',
    );
  });
});

describe('redact', () => {
  it('removes secret values and any address from a text', () => {
    const text = `535 login ${USER} with ${PASSWORD} for ${ADMIN} failed`;

    expect(redact(text, [USER, PASSWORD, ADMIN])).toBe('535 login *** with *** for *** failed');
  });

  it('masks addresses that were not given as secrets', () => {
    expect(redact('550 user someone@example.com unknown', [])).toBe(
      '550 user s***@example.com unknown',
    );
  });

  it('ignores empty secrets', () => {
    expect(redact('plain', ['', undefined])).toBe('plain');
  });
});

describe('runSmtpCheck', () => {
  it('sends the test email to the first admin and reports success without exposing addresses', async () => {
    const send = jest.fn().mockResolvedValue(undefined);

    const result = await runSmtpCheck(production, () => ({ send }) as Mailer);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ADMIN, subject: 'Prueba de correo de debus' }),
    );
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Enviado correctamente');
    expect(result.message).toContain('p***@universidad.edu.gt');
    expect(result.message).not.toContain(ADMIN);
    expect(result.message).not.toContain(USER);
    expect(result.message).not.toContain(PASSWORD);
  });

  it('builds the mailer from the same settings the service uses', async () => {
    const mailerFor = jest.fn(() => ({ send: jest.fn() }) as unknown as Mailer);

    await runSmtpCheck(production, mailerFor);

    expect(mailerFor).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.objectContaining({ host: 'smtp.gmail.com', port: 465, secure: true }),
      }),
    );
  });

  it('fails when the destination variable is missing', async () => {
    const env = { ...production, BOOTSTRAP_ADMIN_EMAIL: undefined };

    const result = await runSmtpCheck(env, () => ({ send: jest.fn() }) as unknown as Mailer);

    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining('BOOTSTRAP_ADMIN_EMAIL'),
    });
  });

  it('names the missing credentials without printing any value', async () => {
    const result = await runSmtpCheck(
      { DEBUS_ENV: 'production', BOOTSTRAP_ADMIN_EMAIL: ADMIN },
      () => ({ send: jest.fn() }) as unknown as Mailer,
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain('SMTP_USER');
    expect(result.message).toContain('SMTP_PASSWORD');
    expect(result.message).not.toContain(ADMIN);
  });

  it.each([
    ['EAUTH code', { code: 'EAUTH' }],
    ['535 response', { responseCode: 535 }],
  ])('explains a rejected login (%s)', async (_name, fields) => {
    const mailerFor = failingWith(
      smtpError(`Invalid login: 535-5.7.8 Username and Password not accepted for ${USER}`, fields),
    );

    const result = await runSmtpCheck(production, mailerFor);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('contraseña de aplicación');
    expect(result.message).toContain('verificación en 2 pasos');
    expect(result.message).not.toContain(USER);
    expect(result.message).not.toContain(PASSWORD);
  });

  it.each(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED', 'ENOTFOUND'])(
    'explains a missing connection (%s)',
    async (code) => {
      const mailerFor = failingWith(smtpError('connect failed', { code }));

      const result = await runSmtpCheck(production, mailerFor);

      expect(result.ok).toBe(false);
      expect(result.message).toContain('No hay conexión con smtp.gmail.com:465');
      expect(result.message).toContain(code);
    },
  );

  it('reports the code and a redacted server message for any other failure', async () => {
    const mailerFor = failingWith(
      smtpError(`550 5.1.1 Recipient ${ADMIN} rejected, sender ${USER}, secret ${PASSWORD}`, {
        code: 'EENVELOPE',
        responseCode: 550,
      }),
    );

    const result = await runSmtpCheck(production, mailerFor);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('EENVELOPE');
    expect(result.message).toContain('550');
    expect(result.message).toContain('Recipient *** rejected');
    for (const secret of [ADMIN, USER, PASSWORD]) expect(result.message).not.toContain(secret);
  });

  it('copes with a failure that is not an Error and has no code', async () => {
    const send = jest.fn().mockRejectedValue('boom');

    const result = await runSmtpCheck(production, () => ({ send }) as Mailer);

    expect(result).toEqual({ ok: false, message: expect.stringContaining('boom') });
  });

  it('tests against Mailpit locally without credentials', async () => {
    const send = jest.fn().mockResolvedValue(undefined);

    const result = await runSmtpCheck(
      { DEBUS_ENV: 'local', BOOTSTRAP_ADMIN_EMAIL: ADMIN },
      () => ({ send }) as Mailer,
    );

    expect(result.ok).toBe(true);
  });
});
