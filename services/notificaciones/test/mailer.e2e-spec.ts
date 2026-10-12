import { testEmail } from '@debus/config/test-data';
import { Test } from '@nestjs/testing';
import { MailModule } from '../src/mail/mail.module';
import { Mailer } from '../src/mail/mailer';
import { findMail } from './mailpit';

type Env = Record<string, string | undefined>;

function assignEnv(values: Env): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function withEnv<T>(env: Env, run: () => Promise<T>): Promise<T> {
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  assignEnv(env);
  try {
    return await run();
  } finally {
    assignEnv(previous);
  }
}

describe('Mailer against Mailpit', () => {
  it('delivers the message', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [MailModule] }).compile();
    // Test files share one Mailpit inbox, so each recipient is unique instead of clearing it.
    const to = testEmail('mailer');

    await moduleRef.get(Mailer).send({
      to,
      subject: 'Prueba',
      html: '<p>Hola</p>',
      text: 'Hola',
    });

    const messages = await findMail(to);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.Subject).toBe('Prueba');
  });

  it('refuses to boot in production without the Gmail account', async () => {
    await withEnv({ DEBUS_ENV: 'production', SMTP_USER: undefined, SMTP_PASSWORD: undefined }, () =>
      expect(Test.createTestingModule({ imports: [MailModule] }).compile()).rejects.toThrow(
        'SMTP_USER and SMTP_PASSWORD are required',
      ),
    );
  });

  it('boots in production once the Gmail account is configured', async () => {
    const env = { DEBUS_ENV: 'production', SMTP_USER: 'debus@gmail.com', SMTP_PASSWORD: 'abcd' };

    await withEnv(env, async () => {
      const moduleRef = await Test.createTestingModule({ imports: [MailModule] }).compile();
      expect(moduleRef.get(Mailer)).toBeInstanceOf(Mailer);
    });
  });
});
