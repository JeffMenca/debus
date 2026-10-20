import { errorResponseSchema } from './http';
import {
  CIRCUIT_STATES,
  circuitSchema,
  probeStatusSchema,
  serviceHealthSchema,
  systemStatusSchema,
  unitHealthSchema,
} from './system';

describe('circuit schemas', () => {
  const open = {
    target: 'clientes',
    state: 'open',
    failures: 5,
    retryAt: '2026-10-19T10:32:05.000Z',
  };

  it('accepts a circuit in every state, with or without a retry time', () => {
    expect(CIRCUIT_STATES).toEqual(['closed', 'open', 'half-open']);
    expect(circuitSchema.parse(open)).toEqual(open);
    expect(circuitSchema.parse({ ...open, state: 'closed', failures: 0, retryAt: null })).toEqual({
      ...open,
      state: 'closed',
      failures: 0,
      retryAt: null,
    });
  });

  it('rejects an unknown state, a unit that is not a backend service and a negative count', () => {
    expect(circuitSchema.safeParse({ ...open, state: 'broken' }).success).toBe(false);
    expect(circuitSchema.safeParse({ ...open, target: 'gateway' }).success).toBe(false);
    expect(circuitSchema.safeParse({ ...open, failures: -1 }).success).toBe(false);
    expect(circuitSchema.safeParse({ ...open, retryAt: 'tomorrow' }).success).toBe(false);
  });

  it('describes the body of a service health check', () => {
    const body = { status: 'ok', service: 'ventas', circuits: [open] };

    expect(serviceHealthSchema.parse(body)).toEqual(body);
    expect(serviceHealthSchema.safeParse({ status: 'ok', service: 'ventas' }).success).toBe(false);
  });

  it('keeps a unit health without circuits valid', () => {
    const unit = { unit: 'flota', status: 'up', latencyMs: 12 };

    expect(unitHealthSchema.parse(unit)).toEqual(unit);
    expect(unitHealthSchema.parse({ ...unit, circuits: [open] })).toEqual({
      ...unit,
      circuits: [open],
    });
  });
});

describe('system API schemas', () => {
  it('accepts a system status with gateway and backends', () => {
    const status = {
      environment: 'production',
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
