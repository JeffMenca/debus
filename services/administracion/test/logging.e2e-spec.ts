import { captureLogs } from '@debus/messaging';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('administracion logs', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('never writes bearer tokens, cookies or the platform credential', async () => {
    const output = await captureLogs(async () => {
      await request(app.getHttpServer())
        .get('/health')
        .set('authorization', 'Bearer access-token-secret')
        .set('cookie', 'session=cookie-secret-value')
        .set('x-serverless-authorization', 'Bearer cloud-secret-value')
        .expect(200);
    }, '/health');

    expect(output).toContain('/health');
    expect(output).not.toContain('access-token-secret');
    expect(output).not.toContain('cookie-secret-value');
    expect(output).not.toContain('cloud-secret-value');
  });
});
