import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureDocs, configureGateway } from '../src/bootstrap';
import { pointServicesAt, startStub } from './support/stub';
import { useTestKeys } from './support/tokens';

describe('gateway documentation', () => {
  let app: INestApplication;
  let stub: Server;

  beforeAll(async () => {
    useTestKeys();
    stub = await startStub();
    pointServicesAt(stub);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureGateway(app);
    configureDocs(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    stub.close();
  });

  it('serves one OpenAPI document with every service under /api', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json').expect(200);

    expect(response.body.paths['/api/administracion/things']).toBeDefined();
    expect(response.body.paths['/api/flota/things']).toBeDefined();
    expect(response.body.paths['/api/system/status']).toBeDefined();
    // The stub keeps reportes down on purpose.
    expect(response.body.info.description).toContain('reportes');
  });

  it('serves the Swagger UI pointing at the combined document', async () => {
    const page = await request(app.getHttpServer()).get('/docs/').expect(200);
    const init = await request(app.getHttpServer()).get('/docs/swagger-ui-init.js').expect(200);

    expect(page.text.toLowerCase()).toContain('swagger');
    expect(init.text).toContain('/docs-json');
  });
});
