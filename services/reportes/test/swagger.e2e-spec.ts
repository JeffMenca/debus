import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { startReportes } from './support/app';

type Method = 'get' | 'post' | 'delete';

// Every route of the service lists its success code and the errors it can answer.
const ROUTES: [method: Method, path: string, codes: string[]][] = [
  ['get', '/reports/branch-buses', ['200', '400', '401', '403']],
  ['get', '/reports/branch-buses/pdf', ['200', '400', '401', '403', '409']],
  ['get', '/reports/branch-drivers', ['200', '400', '401', '403']],
  ['get', '/reports/branch-drivers/pdf', ['200', '400', '401', '403', '409']],
  ['get', '/reports/branch-depreciation', ['200', '400', '401', '403']],
  ['get', '/reports/branch-depreciation/pdf', ['200', '400', '401', '403', '409']],
  ['get', '/reports/branch-ticket-income', ['200', '400', '401', '403']],
  ['get', '/reports/branch-ticket-income/pdf', ['200', '400', '401', '403', '409']],
  ['get', '/reports/branch-rental-income', ['200', '400', '401', '403']],
  ['get', '/reports/branch-rental-income/pdf', ['200', '400', '401', '403', '409']],
  ['get', '/reports/branch-repair-expenses', ['200', '400', '401', '403']],
  ['get', '/reports/branch-repair-expenses/pdf', ['200', '400', '401', '403', '409']],
  ['get', '/reports/system-income', ['200', '400', '401', '403']],
  ['get', '/reports/system-income/pdf', ['200', '400', '401', '403', '409']],
  ['get', '/reports/system-expenses', ['200', '400', '401', '403']],
  ['get', '/reports/system-expenses/pdf', ['200', '400', '401', '403', '409']],
  ['get', '/reports/system-profit', ['200', '400', '401', '403']],
  ['get', '/reports/system-profit/pdf', ['200', '400', '401', '403', '409']],
  ['get', '/reports/system-top-routes', ['200', '400', '401', '403']],
  ['get', '/reports/system-top-routes/pdf', ['200', '400', '401', '403', '409']],
  ['get', '/reports/system-repair-expenses', ['200', '400', '401', '403']],
  ['get', '/reports/system-repair-expenses/pdf', ['200', '400', '401', '403', '409']],
  ['get', '/reports/system-bus-options', ['200', '400', '401', '403']],
  ['get', '/reports/system-routes-map', ['200', '400', '401', '403']],
  ['get', '/reports/system-routes-map/pdf', ['200', '400', '401', '403']],
  ['get', '/reports/system-architecture', ['200', '400', '401', '403']],
  ['get', '/reports/system-architecture/pdf', ['200', '400', '401', '403']],
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
    expect(document.paths['/reports/branch-drivers']?.get?.description).toBe(
      'Allowed roles: BRANCH_ADMIN.',
    );
    expect(document.paths['/reports/branch-drivers/pdf']?.get?.description).toBe(
      'Allowed roles: BRANCH_ADMIN.',
    );
    expect(document.paths['/reports/branch-depreciation']?.get?.description).toBe(
      'Allowed roles: BRANCH_ADMIN.',
    );
    expect(document.paths['/reports/branch-depreciation/pdf']?.get?.description).toBe(
      'Allowed roles: BRANCH_ADMIN.',
    );
    expect(document.paths['/reports/branch-ticket-income']?.get?.description).toBe(
      'Allowed roles: BRANCH_ADMIN.',
    );
    expect(document.paths['/reports/branch-ticket-income/pdf']?.get?.description).toBe(
      'Allowed roles: BRANCH_ADMIN.',
    );
    expect(document.paths['/reports/branch-rental-income']?.get?.description).toBe(
      'Allowed roles: BRANCH_ADMIN.',
    );
    expect(document.paths['/reports/branch-rental-income/pdf']?.get?.description).toBe(
      'Allowed roles: BRANCH_ADMIN.',
    );
    expect(document.paths['/reports/branch-repair-expenses']?.get?.description).toBe(
      'Allowed roles: BRANCH_ADMIN.',
    );
    expect(document.paths['/reports/branch-repair-expenses/pdf']?.get?.description).toBe(
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

  it('documents the filters of the drivers report as optional query parameters', () => {
    const parameters = (document.paths['/reports/branch-drivers']?.get?.parameters ?? []) as {
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

  it('documents the period and the search of the depreciation report as optional query parameters', () => {
    const parameters = (document.paths['/reports/branch-depreciation']?.get?.parameters ?? []) as {
      in: string;
      name: string;
      required?: boolean;
    }[];

    expect(parameters.filter((p) => p.in === 'query').map((p) => [p.name, p.required])).toEqual(
      expect.arrayContaining([
        ['from', false],
        ['to', false],
        ['q', false],
        ['page', false],
        ['pageSize', false],
      ]),
    );
  });

  it('documents the period, the bus and the category of the repair report as optional query parameters', () => {
    const parameters = (document.paths['/reports/branch-repair-expenses']?.get?.parameters ??
      []) as { in: string; name: string; required?: boolean }[];

    expect(parameters.filter((p) => p.in === 'query').map((p) => [p.name, p.required])).toEqual(
      expect.arrayContaining([
        ['from', false],
        ['to', false],
        ['busId', false],
        ['categoryId', false],
        ['page', false],
        ['pageSize', false],
      ]),
    );
  });

  it('documents the period, the route and the bus of the ticket income report as optional query parameters', () => {
    const parameters = (document.paths['/reports/branch-ticket-income']?.get?.parameters ?? []) as {
      in: string;
      name: string;
      required?: boolean;
    }[];

    expect(parameters.filter((p) => p.in === 'query').map((p) => [p.name, p.required])).toEqual(
      expect.arrayContaining([
        ['from', false],
        ['to', false],
        ['routeId', false],
        ['busId', false],
        ['page', false],
        ['pageSize', false],
      ]),
    );
  });

  it('documents the period and the search of the rental income report as optional query parameters', () => {
    const parameters = (document.paths['/reports/branch-rental-income']?.get?.parameters ?? []) as {
      in: string;
      name: string;
      required?: boolean;
    }[];

    expect(parameters.filter((p) => p.in === 'query').map((p) => [p.name, p.required])).toEqual(
      expect.arrayContaining([
        ['from', false],
        ['to', false],
        ['q', false],
        ['page', false],
        ['pageSize', false],
      ]),
    );
  });
});
