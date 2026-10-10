import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { BACKEND_SERVICES, serviceUrlVariable } from '@debus/contracts';

export const received: { method?: string; url?: string; headers: IncomingMessage['headers'] }[] =
  [];

// One stub plays every backend under /<service>.
export function startStub(): Promise<Server> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, headers: req.headers });
      const json = (status: number, value: unknown) =>
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
      if (req.url?.endsWith('/health')) return json(200, { status: 'ok' });
      if (req.url?.startsWith('/flota/events/processed/')) {
        return json(200, { processedAt: '2026-10-06T12:00:00.000Z' });
      }
      if (req.url?.includes('/events/processed/')) return json(404, {});
      return json(200, { url: req.url, body });
    });
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

// reportes points to a closed port so tests can see a service that is down.
export function pointServicesAt(server: Server): void {
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const service of BACKEND_SERVICES) {
    process.env[serviceUrlVariable(service)] =
      service === 'reportes' ? 'http://127.0.0.1:1' : `${base}/${service}`;
  }
}
