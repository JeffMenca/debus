import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { createTestApp } from './support/app';

// Every route lists its success code and every error code it can answer, so the API stays documented.
const ROUTES: [method: 'get' | 'post' | 'patch', path: string, codes: string[]][] = [
  ['post', '/auth/signup', ['202', '400']],
  ['post', '/auth/password/forgot', ['202', '400']],
  ['post', '/auth/links/status', ['200', '400']],
  ['post', '/auth/links/renew', ['202', '400', '409']],
  ['post', '/auth/password', ['204', '400', '409', '410']],
  ['post', '/auth/login', ['200', '400', '401', '423']],
  ['post', '/auth/refresh', ['200', '400', '401']],
  ['post', '/auth/logout', ['204', '400']],
  ['get', '/auth/me', ['200', '401']],
  ['get', '/branches', ['200', '400', '401']],
  ['get', '/branches/{id}', ['200', '400', '401', '403', '404']],
  ['post', '/branches', ['201', '400', '401', '403', '409']],
  ['patch', '/branches/{id}', ['200', '400', '401', '403', '404', '409']],
  ['post', '/branches/{id}/deactivate', ['204', '400', '401', '403', '404']],
  ['post', '/branches/{id}/reactivate', ['204', '400', '401', '403', '404', '409']],
  ['get', '/users', ['200', '400', '401', '403']],
  ['get', '/users/{id}', ['200', '400', '401', '403', '404']],
  ['get', '/settings', ['200', '400', '401', '403']],
  ['post', '/settings', ['201', '400', '401', '403']],
  ['post', '/users', ['201', '400', '401', '403', '409']],
  ['patch', '/users/{id}', ['200', '400', '401', '403', '404', '409']],
  ['post', '/users/{id}/invitation', ['202', '400', '401', '403', '404', '409', '429']],
  ['post', '/users/{id}/deactivate', ['204', '400', '401', '403', '404', '409']],
  ['post', '/users/{id}/reactivate', ['204', '400', '401', '403', '404', '409']],
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

  const queryParameters = (path: string) =>
    (
      (document.paths[path]?.get?.parameters ?? []) as {
        in: string;
        name: string;
        required?: boolean;
      }[]
    )
      .filter((parameter) => parameter.in === 'query')
      .map((parameter) => [parameter.name, parameter.required]);

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
      'Allowed roles: SYSTEM_ADMIN.',
    );
    expect(document.paths['/users']?.post?.description).toBe(
      'Allowed roles: SYSTEM_ADMIN, BRANCH_ADMIN.',
    );
  });

  it('documents the filters of the user list as optional query parameters', () => {
    expect(queryParameters('/users')).toEqual(
      expect.arrayContaining([
        ['role', false],
        ['status', false],
        ['branchId', false],
        ['group', false],
        ['q', false],
      ]),
    );
  });

  it.each(['/users', '/branches', '/settings'])('documents the paging of %s', (path) => {
    expect(queryParameters(path)).toEqual(
      expect.arrayContaining([
        ['page', false],
        ['pageSize', false],
      ]),
    );
  });

  it('groups the routes under English tags', () => {
    const tagOf = (path: string, method: 'get' | 'post' | 'patch') =>
      document.paths[path]?.[method]?.tags;

    expect(tagOf('/auth/signup', 'post')).toEqual(['accounts']);
    expect(tagOf('/auth/password', 'post')).toEqual(['accounts']);
    expect(tagOf('/auth/login', 'post')).toEqual(['sessions']);
    expect(tagOf('/auth/me', 'get')).toEqual(['sessions']);
    expect(tagOf('/users', 'post')).toEqual(['users']);
  });

  it('describes every response in English', () => {
    const descriptions = Object.values(document.paths).flatMap((methods) =>
      Object.values(methods ?? {}).flatMap((operation: { responses?: object }) =>
        Object.values(operation.responses ?? {}).map(
          (r: { description?: string }) => r.description ?? '',
        ),
      ),
    );

    expect(descriptions.length).toBeGreaterThan(0);
    for (const description of descriptions) {
      expect(description).not.toMatch(/[áéíóúñ¿¡]/i);
    }
    expect(document.paths['/auth/login']?.post?.responses['423']).toMatchObject({
      description: 'Account temporarily locked after failed attempts.',
    });
  });
});
