import type { Server } from 'node:http';
import { captureLogs } from '@debus/messaging';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureGateway } from '../src/bootstrap';
import { pointServicesAt, startStub } from './support/stub';
import { bearer, useTestKeys } from './support/tokens';

describe('gateway logs', () => {
  let app: INestApplication;
  let stub: Server;

  beforeAll(async () => {
    useTestKeys();
    stub = await startStub();
    pointServicesAt(stub);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureGateway(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    stub.close();
  });

  it('never writes bearer tokens or cookies', async () => {
    const authorization = bearer({ role: 'CLIENT' });
    const secret = authorization.slice('Bearer '.length);

    const output = await captureLogs(async () => {
      await request(app.getHttpServer())
        .get('/api/flota/buses')
        .set('authorization', authorization)
        .set('cookie', 'session=cookie-secret-value')
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/flota/buses')
        .set('authorization', 'Bearer rejected-token-value')
        .set('x-serverless-authorization', 'Bearer cloud-secret-value')
        .expect(401);
    }, '/api/flota/buses');

    expect(output).toContain('/api/flota/buses');
    expect(output).not.toContain(secret);
    expect(output).not.toContain('cookie-secret-value');
    expect(output).not.toContain('rejected-token-value');
    expect(output).not.toContain('cloud-secret-value');
  });
});
