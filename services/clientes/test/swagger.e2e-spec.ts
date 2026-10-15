import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createTestApp } from './support/app';

type Operation = { responses?: Record<string, unknown>; parameters?: { name: string }[] };

describe('the Swagger description of the profile and wallet routes', () => {
  let app: INestApplication;
  let paths: Record<string, Record<string, Operation>>;
  const statuses = (path: string, method: string) =>
    Object.keys(paths[path]?.[method]?.responses ?? {});

  beforeAll(async () => {
    app = await createTestApp();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('clientes').build(),
    );
    paths = document.paths as typeof paths;
  });
  afterAll(async () => {
    await app.close();
  });

  it('documents the answers of the profile and the wallet', () => {
    expect(statuses('/profile', 'get')).toEqual(expect.arrayContaining(['200', '401', '404']));
    expect(statuses('/profile', 'put')).toEqual(expect.arrayContaining(['200', '400', '409']));
    expect(statuses('/wallet', 'get')).toEqual(expect.arrayContaining(['200', '404']));
    expect(statuses('/wallet/top-ups', 'post')).toEqual(
      expect.arrayContaining(['201', '400', '409']),
    );
    expect(statuses('/wallet/movements', 'get')).toEqual(expect.arrayContaining(['200', '400']));
  });

  it('documents the debit ventas calls, with its key and its lack of balance', () => {
    const debit = paths['/internal/wallet/debits']?.post;

    expect(statuses('/internal/wallet/debits', 'post')).toEqual(
      expect.arrayContaining(['200', '404', '409', '422']),
    );
    expect(debit?.parameters?.map((parameter) => parameter.name)).toContain('idempotency-key');
    expect(
      paths['/wallet/top-ups']?.post?.parameters?.map((parameter) => parameter.name),
    ).toContain('idempotency-key');
  });
});
