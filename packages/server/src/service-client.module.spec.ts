import { circuitOptionsFromEnv } from './circuit-breaker';
import { serviceClientFromEnv } from './service-client.module';

describe('serviceClientFromEnv', () => {
  const tokens = { headersFor: jest.fn().mockResolvedValue({}) };

  it('builds the breakers with the thresholds of the environment', async () => {
    const env = {
      SERVICE_URL_CLIENTES: 'http://clientes',
      CIRCUIT_FAILURE_THRESHOLD: '2',
      CIRCUIT_OPEN_MS: '1000',
    };
    const realFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as typeof fetch;
    const client = serviceClientFromEnv(tokens, env);

    await client.post('clientes', '/x', {}, { parse: jest.fn() } as never, {}).catch(() => null);
    await client.post('clientes', '/x', {}, { parse: jest.fn() } as never, {}).catch(() => null);
    global.fetch = realFetch;

    expect(circuitOptionsFromEnv(env)).toEqual({ failureThreshold: 2, openMs: 1000 });
    expect(client.isOpen('clientes')).toBe(true);
    expect(client.circuits()).toHaveLength(1);
  });

  it('falls back to the defaults when the variables are missing or invalid', async () => {
    const client = serviceClientFromEnv(tokens, {
      SERVICE_URL_CLIENTES: 'http://clientes',
      CIRCUIT_FAILURE_THRESHOLD: 'many',
    });

    expect(client.isOpen('clientes')).toBe(false);
    expect(client.circuits()[0]).toMatchObject({ failures: 0, state: 'closed' });
  });
});
