import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createEnvelope } from '@debus/contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64'), messageId: '1' },
  subscription: 'test',
});

describe('Pub/Sub push endpoint', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('records a probe exactly once even when delivered twice', async () => {
    const envelope = createEnvelope(
      'SondeoEmitido',
      { requestedAt: new Date().toISOString() },
      'c',
    );
    const server = app.getHttpServer();

    await request(server).post('/events/pubsub').send(push(envelope)).expect(204);
    await request(server).post('/events/pubsub').send(push(envelope)).expect(204);

    const response = await request(server).get(`/events/processed/${envelope.eventId}`).expect(200);
    expect(response.body).toMatchObject({ eventId: envelope.eventId, type: 'SondeoEmitido' });
    const stored = await app
      .get(PrismaService)
      .processedEvent.count({ where: { eventId: envelope.eventId } });
    expect(stored).toBe(1);
  });

  it('answers 404 for events it never received', async () => {
    await request(app.getHttpServer()).get('/events/processed/never').expect(404);
  });

  it('answers 400 to a malformed push', async () => {
    await request(app.getHttpServer()).post('/events/pubsub').send({ message: {} }).expect(400);
  });
});
