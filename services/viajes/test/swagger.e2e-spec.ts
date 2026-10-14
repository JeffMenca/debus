import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createTestApp } from './support/app';

describe('the Swagger description of the roles of each route', () => {
  let app: INestApplication;
  let paths: Record<string, Record<string, { description?: string }>>;

  beforeAll(async () => {
    app = await createTestApp();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('viajes').build(),
    );
    paths = document.paths as typeof paths;
  });

  afterAll(async () => {
    await app.close();
  });

  it('names the roles of a route that has its own, and those of the controller otherwise', () => {
    expect(paths['/trips/{id}']?.get?.description).toContain(
      'Allowed roles: BRANCH_ADMIN, DRIVER.',
    );
    expect(paths['/trips']?.get?.description).toContain('Allowed roles: BRANCH_ADMIN, DRIVER.');
    expect(paths['/trips']?.post?.description).toContain('Allowed roles: BRANCH_ADMIN.');
  });

  it('names them on the departure, the arrival and the deletion of a trip', () => {
    expect(paths['/trips/{id}/departure']?.post?.description).toContain(
      'Allowed roles: BRANCH_ADMIN, DRIVER.',
    );
    expect(paths['/trips/{id}/arrival']?.post?.description).toContain(
      'Allowed roles: BRANCH_ADMIN, DRIVER.',
    );
    expect(paths['/trips/{id}']?.delete?.description).toContain('Allowed roles: BRANCH_ADMIN.');
  });
});
