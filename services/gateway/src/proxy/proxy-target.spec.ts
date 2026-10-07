import type { BackendService } from '@debus/contracts';
import { resolveProxyTarget } from './proxy-target';

const urls = { flota: 'https://flota', ventas: 'https://ventas' } as Record<BackendService, string>;
const resolve = (url: string) => resolveProxyTarget(url, urls);

describe('resolveProxyTarget', () => {
  it('maps the prefix to the service and keeps the rest of the path and query', () => {
    expect(resolve('/api/flota/buses?estado=activo')).toEqual({
      kind: 'service',
      service: 'flota',
      target: 'https://flota',
      path: '/buses?estado=activo',
    });
    expect(resolve('/api/ventas')).toMatchObject({ kind: 'service', path: '/' });
  });

  it.each([
    '/api/desconocido/x',
    '/api/gateway/health',
    '/api/flota/events/pubsub',
    '/api/flota/events/processed/1',
    '/api/flota/outbox/flush',
    '/api/flota/../events/pubsub',
    '/api/flota/%2e%2e/events/pubsub',
    '/api/flota/%E0%A4%A',
    '/health',
  ])('refuses %s', (url) => {
    expect(resolve(url)).toEqual({ kind: 'not-found' });
  });
});
