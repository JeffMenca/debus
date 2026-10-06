import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports the service as up', () => {
    const controller = new HealthController();

    const result = controller.check();

    expect(result).toEqual({ status: 'ok', service: 'clientes' });
  });
});
