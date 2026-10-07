import type { GatewayConfig } from '../config/gateway-config';
import type { ServiceClient } from '../upstream/service-client';
import { SystemStatusService } from './system-status.service';

describe('SystemStatusService', () => {
  it('reports the gateway and every backend, marking failures as down', async () => {
    const get = jest.fn((service: string) => {
      if (service === 'reportes') return Promise.reject(new Error('timeout'));
      if (service === 'ventas') return Promise.resolve(new Response('', { status: 503 }));
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    const service = new SystemStatusService(
      { environment: 'production' } as GatewayConfig,
      { get } as unknown as ServiceClient,
    );

    const status = await service.check('c-1');

    expect(status.environment).toBe('production');
    expect(status.units).toHaveLength(8);
    expect(status.units[0]).toEqual({ unit: 'gateway', status: 'up', latencyMs: 0 });
    expect(status.units.find((u) => u.unit === 'reportes')?.status).toBe('down');
    expect(status.units.find((u) => u.unit === 'ventas')?.status).toBe('down');
    expect(status.units.find((u) => u.unit === 'flota')?.status).toBe('up');
    expect(get).toHaveBeenCalledWith('flota', '/health', 'c-1');
  });
});
