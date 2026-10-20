import type { ServiceHttpClient } from '@debus/server';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports the service as up, with no circuits when it calls no other service', () => {
    const controller = new HealthController();

    const result = controller.check();

    expect(result).toEqual({ status: 'ok', service: 'flota', circuits: [] });
  });

  it('reports the circuits of the services it calls', () => {
    const circuits = [
      { target: 'flota', state: 'open', failures: 5, retryAt: '2026-10-19T10:32:05.000Z' },
    ];
    const http = { circuits: () => circuits } as unknown as ServiceHttpClient;

    const result = new HealthController(http).check();

    expect(result).toEqual({ status: 'ok', service: 'flota', circuits });
  });
});
