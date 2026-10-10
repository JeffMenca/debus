import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createEnvelope } from '@debus/contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { findMail, mailHtml } from './mailpit';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64'), messageId: '1' },
  subscription: 'test',
});

describe('EnlaceDeCuentaEmitido', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends exactly one email even when the event arrives twice', async () => {
    const email = `link-${Date.now()}@correo.com`;
    const envelope = createEnvelope(
      'EnlaceDeCuentaEmitido',
      {
        userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        email,
        fullName: 'Ana López',
        reason: 'INVITATION',
        link: 'https://web.example/crear-contrasena?token=abc',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      'c',
    );
    const server = app.getHttpServer();

    await request(server).post('/events/pubsub').send(push(envelope)).expect(204);
    await request(server).post('/events/pubsub').send(push(envelope)).expect(204);

    const messages = await findMail(email);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.Subject).toBe('Te damos la bienvenida a debus');
    expect(await mailHtml(messages[0]!.ID)).toContain('crear-contrasena?token=abc');
    const stored = await app.get(PrismaService).sentEmail.findMany({ where: { recipient: email } });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.template).toBe('INVITATION');
  });

  it.each([
    ['PASSWORD_RESET', 'Restablece tu contraseña de debus', 'restablecer?token=abc'],
    ['ALREADY_REGISTERED', 'Ya tienes una cuenta en debus', undefined],
  ] as const)('delivers the %s email in Spanish', async (reason, subject, linkPart) => {
    const email = `${reason.toLowerCase()}-${Date.now()}@correo.com`;
    const envelope = createEnvelope(
      'EnlaceDeCuentaEmitido',
      {
        userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        email,
        fullName: 'Ana López',
        reason,
        ...(linkPart && {
          link: 'https://web.example/restablecer?token=abc',
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        }),
      },
      'c',
    );

    await request(app.getHttpServer()).post('/events/pubsub').send(push(envelope)).expect(204);

    const messages = await findMail(email);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.Subject).toBe(subject);
    const html = await mailHtml(messages[0]!.ID);
    if (linkPart) expect(html).toContain(linkPart);
    else expect(html).not.toContain('href="http');
  });

  it('answers 5xx on a broken payload so Pub/Sub retries', async () => {
    const envelope = createEnvelope('EnlaceDeCuentaEmitido', { email: 'x' }, 'c');

    const response = await request(app.getHttpServer()).post('/events/pubsub').send(push(envelope));

    expect(response.status).toBeGreaterThanOrEqual(500);
  });
});
