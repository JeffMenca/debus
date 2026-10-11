import { BACKEND_SERVICES } from '@debus/contracts';
import type { OpenAPIObject } from '@nestjs/swagger';
import { DOCS_CACHE_MS, DocsService } from './docs.service';

const gateway: OpenAPIObject = {
  openapi: '3.0.0',
  info: { title: 'gateway', version: '1.0' },
  paths: {},
};
const serviceDocument = (title: string): OpenAPIObject => ({
  openapi: '3.0.0',
  info: { title, version: '1.0' },
  paths: { '/things': { get: { tags: ['things'], responses: {} } } },
});

const setup = (
  answer: (service: string) => Promise<unknown> = async (service) => ({
    ok: true,
    json: async () => serviceDocument(service),
  }),
) => {
  const client = { get: jest.fn((service: string) => answer(service)) };
  const docs = new DocsService(client as never);
  docs.useGatewayDocument(gateway);
  return { client, docs };
};

describe('DocsService', () => {
  it('asks every service for its document and merges them under /api', async () => {
    const { client, docs } = setup();

    const document = await docs.document('c');

    expect(client.get).toHaveBeenCalledTimes(BACKEND_SERVICES.length);
    expect(client.get).toHaveBeenCalledWith('flota', '/docs-json', 'c');
    expect(document.paths['/api/flota/things']).toBeDefined();
    expect(document.paths['/api/administracion/things']).toBeDefined();
  });

  it('lists a service that answers an error or fails as unavailable', async () => {
    const { docs } = setup(async (service) => {
      if (service === 'reportes') return { ok: false, json: async () => ({}) };
      if (service === 'ventas') throw new Error('connection refused');
      return { ok: true, json: async () => serviceDocument(service) };
    });

    const document = await docs.document('c');

    expect(document.info.description).toContain('Unavailable when generated: ventas, reportes.');
    expect(document.paths['/api/flota/things']).toBeDefined();
  });

  it('serves the cached document for a minute and asks again after that', async () => {
    const { client, docs } = setup();
    const start = 1_000_000;

    const first = await docs.document('c', start);
    const cached = await docs.document('c', start + DOCS_CACHE_MS - 1);
    expect(cached).toBe(first);
    expect(client.get).toHaveBeenCalledTimes(BACKEND_SERVICES.length);

    await docs.document('c', start + DOCS_CACHE_MS);
    expect(client.get).toHaveBeenCalledTimes(BACKEND_SERVICES.length * 2);
  });

  it('drops the cache when the gateway document changes', async () => {
    const { client, docs } = setup();
    await docs.document('c', 1);

    docs.useGatewayDocument(gateway);
    await docs.document('c', 2);

    expect(client.get).toHaveBeenCalledTimes(BACKEND_SERVICES.length * 2);
  });

  it('fails clearly when the gateway document was never set', async () => {
    const docs = new DocsService({ get: jest.fn() } as never);

    await expect(docs.document('c')).rejects.toThrow('gateway document not set');
  });
});
