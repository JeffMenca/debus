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

  describe('circuits of a service', () => {
    const open = {
      target: 'clientes',
      state: 'open',
      failures: 5,
      retryAt: '2026-10-19T10:32:05.000Z',
    };

    const checkWith = async (body: string) => {
      const get = jest.fn(async () => new Response(body, { status: 200 }));
      const service = new SystemStatusService(
        { environment: 'local' } as GatewayConfig,
        { get } as unknown as ServiceClient,
      );
      const status = await service.check('c-1');
      return status.units.find((u) => u.unit === 'ventas');
    };

    it('includes the circuits that a service reports', async () => {
      const unit = await checkWith(
        JSON.stringify({ status: 'ok', service: 'ventas', circuits: [open] }),
      );

      expect(unit).toMatchObject({ status: 'up', circuits: [open] });
    });

    it('leaves them out when an older revision of the service does not report them', async () => {
      const unit = await checkWith(JSON.stringify({ status: 'ok', service: 'ventas' }));

      expect(unit?.status).toBe('up');
      expect(unit).not.toHaveProperty('circuits');
    });

    it('leaves them out when the body is not what the contract describes', async () => {
      const unit = await checkWith(
        JSON.stringify({ status: 'ok', service: 'ventas', circuits: [{ ...open, state: 'x' }] }),
      );

      expect(unit?.status).toBe('up');
      expect(unit).not.toHaveProperty('circuits');
    });

    it('keeps the service up when the body is not JSON', async () => {
      const unit = await checkWith('<html>ok</html>');

      expect(unit?.status).toBe('up');
      expect(unit).not.toHaveProperty('circuits');
    });
  });
});
