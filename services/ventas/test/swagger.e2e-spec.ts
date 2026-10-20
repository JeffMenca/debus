import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createTestApp } from './support/app';

type Operation = { responses?: Record<string, unknown>; parameters?: { name: string }[] };

describe('the Swagger description of the trips on sale and the counter', () => {
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
});
