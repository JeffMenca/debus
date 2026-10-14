import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { startReportes } from './support/app';

type Method = 'get' | 'post' | 'delete';

// Every route of the service lists its success code and the errors it can answer.
const ROUTES: [method: Method, path: string, codes: string[]][] = [
  ['get', '/reports/branch-buses', ['200', '400', '401', '403']],
  ['get', '/reports/branch-buses/pdf', ['200', '400', '401', '403', '409']],
  // Every consumer mounts the dead-letter review of @debus/messaging.
  ['get', '/dead-letters', ['200', '400', '401', '403', '503']],
  ['post', '/dead-letters/{messageId}/replay', ['200', '401', '403', '404', '502', '503']],
  ['delete', '/dead-letters/{messageId}', ['204', '401', '403', '404', '503']],
];

describe('API documentation', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    ({ app } = await startReportes());
    document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  });
  afterAll(async () => {
    await app.close();
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

  it('lists the allowed roles of the report routes', () => {
    expect(document.paths['/reports/branch-buses']?.get?.description).toBe(
      'Allowed roles: BRANCH_ADMIN.',
    );
    expect(document.paths['/reports/branch-buses/pdf']?.get?.description).toBe(
      'Allowed roles: BRANCH_ADMIN.',
    );
  });

  it('documents the PDF as a binary file', () => {
    const content = document.paths['/reports/branch-buses/pdf']?.get?.responses['200'] as {
      content?: Record<string, { schema: { format: string } }>;
    };

    expect(content.content?.['application/pdf']?.schema.format).toBe('binary');
  });

  it('documents the filters of the buses report as optional query parameters', () => {
    const parameters = (document.paths['/reports/branch-buses']?.get?.parameters ?? []) as {
      in: string;
      name: string;
      required?: boolean;
    }[];

    expect(parameters.filter((p) => p.in === 'query').map((p) => [p.name, p.required])).toEqual(
      expect.arrayContaining([
        ['status', false],
        ['q', false],
        ['page', false],
        ['pageSize', false],
      ]),
    );
  });
});
