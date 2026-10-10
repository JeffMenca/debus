import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { createTestApp } from './support/app';

// Every route lists its success code and every error code it can answer, so the API stays documented.
const ROUTES: [method: 'get' | 'post', path: string, codes: string[]][] = [
  ['post', '/auth/signup', ['202', '400']],
  ['post', '/auth/password/forgot', ['202', '400']],
  ['post', '/auth/links/status', ['200', '400']],
  ['post', '/auth/links/renew', ['202', '400', '409']],
  ['post', '/auth/password', ['204', '400', '409', '410']],
  ['post', '/auth/login', ['200', '400', '401', '423']],
  ['post', '/auth/refresh', ['200', '400', '401']],
  ['post', '/auth/logout', ['204', '400']],
  ['get', '/auth/me', ['200', '401']],
  ['post', '/users', ['201', '400', '401', '403', '409']],
  ['post', '/users/{id}/deactivate', ['204', '400', '401', '403', '404', '409']],
  ['post', '/users/{id}/reactivate', ['204', '400', '401', '403', '404']],
];

describe('API documentation', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    app = await createTestApp();
    document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(ROUTES)('documents %s %s with its success and error responses', (method, path, codes) => {
    const operation = document.paths[path]?.[method];

    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual([...codes].sort());
  });

  it('documents every route of the service, so none is added without being listed here', () => {
    const documented = Object.entries(document.paths)
      .filter(([path]) => path !== '/health')
      .flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method} ${path}`));

    expect(documented.sort()).toEqual(ROUTES.map(([method, path]) => `${method} ${path}`).sort());
  });

  it('lists the allowed roles on the routes that need a role', () => {
    expect(document.paths['/users/{id}/deactivate']?.post?.description).toBe(
      'Roles permitidos: SYSTEM_ADMIN.',
    );
    expect(document.paths['/users']?.post?.description).toBe(
      'Roles permitidos: SYSTEM_ADMIN, BRANCH_ADMIN.',
    );
  });
});
