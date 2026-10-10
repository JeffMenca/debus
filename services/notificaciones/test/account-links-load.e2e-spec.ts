import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createEnvelope } from '@debus/contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Mailer, type MailMessage } from '../src/mail/mailer';
import { PrismaService } from '../src/prisma/prisma.service';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64'), messageId: '1' },
  subscription: 'test',
});

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const accountLink = (email: string) =>
  createEnvelope(
    'EnlaceDeCuentaEmitido',
    {
      userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email,
      fullName: 'Ana López',
      reason: 'SIGNUP',
      link: 'https://web.example/crear-contrasena?token=abc',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    },
    'c',
  );

// The Cloud Run pool is 2 connections and SMTP can be slow: neither may break or duplicate a send.
describe('Account link emails under a tiny pool and a slow SMTP server', () => {
  const sent: MailMessage[] = [];
  let sendDelayMs = 0;
  let app: INestApplication;
  let previousPoolMax: string | undefined;

  beforeAll(async () => {
    previousPoolMax = process.env.DB_POOL_MAX;
    process.env.DB_POOL_MAX = '2';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Mailer)
      .useValue({
        send: async (message: MailMessage) => {
          await pause(sendDelayMs);
          sent.push(message);
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (previousPoolMax === undefined) delete process.env.DB_POOL_MAX;
    else process.env.DB_POOL_MAX = previousPoolMax;
  });

  beforeEach(() => {
    sent.length = 0;
  });

  it('delivers two different events at the same time with a pool of two', async () => {
    sendDelayMs = 300;
    const stamp = Date.now();
    const emails = [`pool-a-${stamp}@correo.com`, `pool-b-${stamp}@correo.com`];

    const responses = await Promise.all(
      emails.map((email) =>
        request(app.getHttpServer())
          .post('/events/pubsub')
          .send(push(accountLink(email))),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([204, 204]);
    expect(sent.map((message) => message.to).sort()).toEqual(emails);
    const rows = await app
      .get(PrismaService)
      .sentEmail.findMany({ where: { recipient: { in: emails } } });
    expect(rows).toHaveLength(2);
  }, 20000);

  it('keeps one email and one row when SMTP takes longer than Prisma default timeout', async () => {
    sendDelayMs = 6000;
    const email = `slow-${Date.now()}@correo.com`;

    const response = await request(app.getHttpServer())
      .post('/events/pubsub')
      .send(push(accountLink(email)));

    expect(response.status).toBe(204);
    expect(sent.map((message) => message.to)).toEqual([email]);
    const rows = await app.get(PrismaService).sentEmail.findMany({ where: { recipient: email } });
    expect(rows).toHaveLength(1);
  }, 30000);

  it('queues a burst above the pool size instead of failing the events that wait', async () => {
    sendDelayMs = 2500;
    const stamp = Date.now();
    const emails = Array.from({ length: 4 }, (_, index) => `burst-${index}-${stamp}@correo.com`);

    const responses = await Promise.all(
      emails.map((email) =>
        request(app.getHttpServer())
          .post('/events/pubsub')
          .send(push(accountLink(email))),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([204, 204, 204, 204]);
    expect(sent.map((message) => message.to).sort()).toEqual(emails);
    const rows = await app
      .get(PrismaService)
      .sentEmail.findMany({ where: { recipient: { in: emails } } });
    expect(rows).toHaveLength(4);
  }, 30000);
});
