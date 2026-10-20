import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createTestApp } from './support/app';

type Operation = {
  responses?: Record<string, { content?: Record<string, { schema?: { properties?: object } }> }>;
  parameters?: { name: string; required?: boolean }[];
};

describe('the Swagger description of the trips on sale, the counter and the purchases', () => {
  let app: INestApplication;
  let paths: Record<string, Record<string, Operation>>;
  const statuses = (path: string, method: string) =>
    Object.keys(paths[path]?.[method]?.responses ?? {});

  beforeAll(async () => {
    app = await createTestApp();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('ventas').build(),
    );
    paths = document.paths as typeof paths;
  });
  afterAll(async () => {
    await app.close();
  });

  it('documents the list with its filters and the seat map with its errors', () => {
    expect(statuses('/trips', 'get')).toEqual(expect.arrayContaining(['200', '400', '401']));
    expect(paths['/trips']?.get?.parameters?.map((parameter) => parameter.name)).toEqual(
      expect.arrayContaining(['from', 'to', 'q', 'page', 'pageSize']),
    );
    expect(statuses('/trips/{tripId}/seats', 'get')).toEqual(
      expect.arrayContaining(['200', '400', '401', '404']),
    );
  });

  it('documents the counter: its trips, the key of each sale and every refusal', () => {
    expect(statuses('/counter/trips', 'get')).toEqual(
      expect.arrayContaining(['200', '400', '401', '403']),
    );
    expect(statuses('/counter/tickets', 'post')).toEqual(
      expect.arrayContaining(['201', '400', '401', '403', '404', '409']),
    );
    expect(
      paths['/counter/tickets']?.post?.parameters?.map((parameter) => parameter.name),
    ).toContain('idempotency-key');
  });

  it('documents the purchase: the two success answers, every refusal and the required key', () => {
    expect(statuses('/purchases', 'post')).toEqual(
      expect.arrayContaining(['201', '202', '400', '401', '404', '409', '422', '503']),
    );
    const key = paths['/purchases']?.post?.parameters?.find(
      (parameter) => parameter.name === 'idempotency-key',
    );
    expect(key?.required).toBe(true);
    for (const status of ['201', '202']) {
      const answer = paths['/purchases']?.post?.responses?.[status];
      expect(Object.keys(answer?.content?.['application/json']?.schema?.properties ?? {})).toEqual(
        expect.arrayContaining(['ticketId', 'status', 'failure', 'message', 'ticket']),
      );
    }
  });

  it('documents the read of a purchase and keeps the recovery job out of the documentation', () => {
    expect(statuses('/purchases/{ticketId}', 'get')).toEqual(
      expect.arrayContaining(['200', '400', '401', '404']),
    );
    expect(Object.keys(paths).filter((path) => path.includes('/internal'))).toEqual([]);
  });
});
