import type { OpenAPIObject } from '@nestjs/swagger';
import { mergeOpenApi } from './merge-openapi';

const gateway: OpenAPIObject = {
  openapi: '3.0.0',
  info: { title: 'gateway', version: '1.0' },
  paths: { '/api/system/status': { get: { tags: ['system'], responses: {} } } },
  components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
};

const administracion: OpenAPIObject = {
  openapi: '3.0.0',
  info: { title: 'administracion', version: '1.0' },
  paths: {
    '/branches': {
      post: {
        tags: ['branches'],
        operationId: 'BranchesController_create',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Branch' } } },
        },
        responses: {},
      },
    },
    '/': { get: { responses: {} } },
    '/events/pubsub': { post: { responses: {} } },
    '/outbox/flush': { post: { responses: {} } },
    '/internal/availability': { get: { responses: {} } },
  },
  components: { schemas: { Branch: { type: 'object' } } },
};

describe('mergeOpenApi', () => {
  const merged = mergeOpenApi(gateway, [
    { service: 'administracion', document: administracion },
    { service: 'reportes', document: null },
  ]);

  it('publishes each service under its gateway prefix with namespaced tags and ids', () => {
    const operation = merged.paths['/api/administracion/branches']?.post;

    expect(operation?.tags).toEqual(['administracion · branches']);
    expect(operation?.operationId).toBe('administracion_BranchesController_create');
    expect(merged.paths['/api/system/status']).toBeDefined();
  });

  it('tags operations without tags and maps the root path to the service prefix', () => {
    expect(merged.paths['/api/administracion']?.get?.tags).toEqual(['administracion · general']);
  });

  it('keeps schema references working under a service namespace', () => {
    expect(merged.components?.schemas?.['administracion.Branch']).toEqual({ type: 'object' });
    expect(JSON.stringify(merged.paths['/api/administracion/branches'])).toContain(
      '#/components/schemas/administracion.Branch',
    );
    expect(merged.components?.securitySchemes?.bearer).toBeDefined();
  });

  it('hides the internal Pub/Sub, scheduler and service-to-service endpoints', () => {
    expect(
      Object.keys(merged.paths).some(
        (path) =>
          path.includes('/events') || path.includes('/outbox') || path.includes('/internal'),
      ),
    ).toBe(false);
  });

  it('says which services could not be read', () => {
    expect(merged.info.description).toContain('Unavailable when generated: reportes.');
  });

  it('adds no note when every service answered and keeps the gateway description', () => {
    const complete = mergeOpenApi({ ...gateway, info: { ...gateway.info, description: 'Edge.' } }, [
      { service: 'administracion', document: administracion },
    ]);

    expect(complete.info.description).toBe('Edge.');
    expect(mergeOpenApi(gateway, []).info.description).toBeUndefined();
  });
});
