import type { BackendService } from '@debus/contracts';
import { resolveProxyTarget } from './proxy-target';

const urls = { flota: 'https://flota', ventas: 'https://ventas' } as Record<BackendService, string>;
const resolve = (url: string) => resolveProxyTarget(url, urls);

describe('resolveProxyTarget', () => {
  it('maps the prefix to the service and keeps the rest of the path and query', () => {
    expect(resolve('/api/flota/buses?status=active')).toEqual({
      kind: 'service',
      service: 'flota',
      target: 'https://flota',
      path: '/buses?status=active',
    });
    expect(resolve('/api/ventas')).toMatchObject({ kind: 'service', path: '/' });
  });

  it.each([
    '/api/desconocido/x',
    '/api/gateway/health',
    '/api/flota/events/pubsub',
    '/api/flota/events/processed/1',
    '/api/flota/outbox/flush',
    '/api/flota/outbox',
    '/api/flota//outbox/flush',
    '/api/flota///events/pubsub',
    '/api/flota/OUTBOX/flush',
    '/api/flota/Outbox/flush',
    '/api/flota/Events/pubsub',
    '/api/flota/%2Foutbox/flush',
    '/api/flota/../events/pubsub',
    '/api/flota/%2e%2e/events/pubsub',
    '/api/flota/./outbox/flush',
    '/api/flota/;/outbox/flush',
    '/api/flota/outbox;/flush',
    '/api/flota/outbox/flush;x=1',
    '/api/flota/%2e/outbox/flush',
    '/api/flota/%3b/outbox/flush',
    '/api/flota/buses/.',
    '/api/flota/./buses',
    '/api/flota/buses;jsessionid=1',
    '/api/flota/%E0%A4%A',
    '/health',
  ])('refuses %s', (url) => {
    expect(resolve(url)).toEqual({ kind: 'not-found' });
  });

  it('never exposes the service-to-service endpoints', () => {
    expect(resolve('/api/flota/internal/availability?busId=1')).toEqual({ kind: 'not-found' });
    expect(resolve('/api/viajes/Internal/trips/1/sale-status')).toEqual({ kind: 'not-found' });
  });
});
