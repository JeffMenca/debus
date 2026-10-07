import { errorResponseSchema } from './http';
import { probeStatusSchema, systemStatusSchema } from './system';

describe('system API schemas', () => {
  it('accepts a system status with gateway and backends', () => {
    const status = {
      environment: 'staging',
      checkedAt: '2026-10-06T12:00:00.000Z',
      units: [
        { unit: 'gateway', status: 'up', latencyMs: 0 },
        { unit: 'flota', status: 'down', latencyMs: 10000 },
      ],
    };

    expect(systemStatusSchema.parse(status)).toEqual(status);
  });

  it('accepts probe deliveries in every state', () => {
    const status = {
      probeId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      services: [
        { service: 'flota', state: 'received', receivedAt: '2026-10-06T12:00:01.000Z' },
        { service: 'ventas', state: 'pending' },
        { service: 'reportes', state: 'unreachable' },
      ],
    };

    expect(probeStatusSchema.parse(status)).toEqual(status);
  });

  it('describes the common error body', () => {
    expect(
      errorResponseSchema.safeParse({ statusCode: 502, error: 'Bad Gateway', message: 'x' })
        .success,
    ).toBe(true);
  });
});
