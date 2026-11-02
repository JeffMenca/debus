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

  it.each([
    ['get', '/api/system/status', ['200', '401', '403']],
    ['post', '/api/system/probes', ['202', '401', '403']],
    ['get', '/api/system/probes/{probeId}', ['200', '400', '401', '403']],
  ] as const)(
    'documents %s %s as a system admin route with a bearer token',
    async (method, path, codes) => {
      const response = await request(app.getHttpServer()).get('/docs-json').expect(200);
      const operation = response.body.paths[path][method];

      expect(operation.security).toEqual([{ bearer: [] }]);
      expect(operation.description).toContain('SYSTEM_ADMIN');
      expect(Object.keys(operation.responses).sort()).toEqual([...codes]);
    },
  );

  it('serves the Swagger UI pointing at the combined document', async () => {
    const page = await request(app.getHttpServer()).get('/docs/').expect(200);
    const init = await request(app.getHttpServer()).get('/docs/swagger-ui-init.js').expect(200);

    expect(page.text.toLowerCase()).toContain('swagger');
    expect(init.text).toContain('/docs-json');
    // An embedded spec wins over the url, so the UI would only list the gateway's own routes.
    expect(init.text).toMatch(/"customOptions": \{[^}]*"spec": \{\}/);
  });
});
