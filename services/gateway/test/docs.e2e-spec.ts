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
    // An embedded spec wins over the url in Swagger UI, so it must be empty for the combined document to load.
    expect(init.text).toMatch(/"spec":\s*\{\s*\}/);
  });
});

describe('gateway documentation with a password', () => {
  let app: INestApplication;
  let stub: Server;
  const credentials = `Basic ${Buffer.from('debus:docs-secret').toString('base64')}`;

  beforeAll(async () => {
    useTestKeys();
    process.env.DOCS_PASSWORD = 'docs-secret';
    stub = await startStub();
    pointServicesAt(stub);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureGateway(app);
    configureDocs(app);
    await app.init();
  });

  afterAll(async () => {
    delete process.env.DOCS_PASSWORD;
    await app.close();
    stub.close();
  });

  it.each(['/docs/', '/docs', '/docs/swagger-ui-init.js', '/docs-json', '/docs/gateway-json'])(
    'asks for the password at %s',
    async (path) => {
      const response = await request(app.getHttpServer()).get(path).expect(401);

      expect(response.headers['www-authenticate']).toContain('Basic');
    },
  );

  it('rejects a wrong password', async () => {
    const wrong = `Basic ${Buffer.from('debus:nope').toString('base64')}`;

    await request(app.getHttpServer()).get('/docs-json').set('Authorization', wrong).expect(401);
  });

  it('serves the page and the combined document with the right password', async () => {
    await request(app.getHttpServer()).get('/docs/').set('Authorization', credentials).expect(200);
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .set('Authorization', credentials)
      .expect(200);

    expect(response.body.paths['/api/administracion/things']).toBeDefined();
  });

  it('leaves the API and the health check outside the password', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).get('/api/system/status').expect(401);
  });
});
