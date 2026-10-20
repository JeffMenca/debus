import {
  CircuitBreaker,
  DEFAULT_FAILURE_THRESHOLD,
  DEFAULT_OPEN_MS,
  circuitOptionsFromEnv,
  isCircuitFailure,
} from './circuit-breaker';
import { SERVER_MESSAGES } from './messages';
import { CircuitOpenError, ServiceUnavailableError } from './service-errors';

function breaker(onChange?: jest.Mock) {
  const clock = { now: 1_000_000 };
  const instance = new CircuitBreaker(
    'clientes',
    { failureThreshold: 5, openMs: 30_000, now: () => clock.now },
    onChange,
  );
  return { instance, clock };
}

const failTimes = (instance: CircuitBreaker, times: number) => {
  for (let i = 0; i < times; i++) {
    instance.admit();
    instance.failed();
  }
};

describe('CircuitBreaker', () => {
  it('stays closed after 4 failures in a row', () => {
    const { instance } = breaker();

    failTimes(instance, 4);

    expect(instance.state()).toBe('closed');
    expect(() => instance.admit()).not.toThrow();
    expect(instance.snapshot()).toEqual({
      target: 'clientes',
      state: 'closed',
      failures: 4,
      retryAt: null,
    });
  });

  it('opens on the fifth failure and refuses calls with the time it will try again', () => {
    const { instance, clock } = breaker();

    failTimes(instance, 5);

    expect(instance.state()).toBe('open');
    const error = (() => {
      try {
        instance.admit();
      } catch (reason) {
        return reason as CircuitOpenError;
      }
      throw new Error('admit should have thrown');
    })();
    expect(error).toBeInstanceOf(CircuitOpenError);
    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(error.message).toBe(SERVER_MESSAGES.paused);
    expect(error.target).toBe('clientes');
    expect(error.retryAt.getTime()).toBe(clock.now + 30_000);
    expect(instance.snapshot()).toEqual({
      target: 'clientes',
      state: 'open',
      failures: 5,
      retryAt: new Date(clock.now + 30_000).toISOString(),
    });
  });

  it('keeps refusing until openMs has passed', () => {
    const { instance, clock } = breaker();
    failTimes(instance, 5);

    clock.now += 29_999;

    expect(instance.state()).toBe('open');
    expect(() => instance.admit()).toThrow(CircuitOpenError);
  });

  it('turns half-open after openMs and lets a single probe through', () => {
    const { instance, clock } = breaker();
    failTimes(instance, 5);
    clock.now += 30_000;

    expect(instance.state()).toBe('half-open');
    expect(() => instance.admit()).not.toThrow();
    expect(() => instance.admit()).toThrow(CircuitOpenError);
    expect(instance.state()).toBe('half-open');
  });

  it('closes with no failures when the probe works', () => {
    const { instance, clock } = breaker();
    failTimes(instance, 5);
    clock.now += 30_000;
    instance.admit();

    instance.succeeded();

    expect(instance.state()).toBe('closed');
    expect(instance.snapshot()).toMatchObject({ failures: 0, retryAt: null });
    expect(() => instance.admit()).not.toThrow();
  });

  it('opens again for another openMs when the probe fails', () => {
    const { instance, clock } = breaker();
    failTimes(instance, 5);
    clock.now += 30_000;
    instance.admit();

    instance.failed();

    expect(instance.state()).toBe('open');
    expect(instance.snapshot().retryAt).toBe(new Date(clock.now + 30_000).toISOString());
    expect(() => instance.admit()).toThrow(CircuitOpenError);
  });

  it('resets the count on a success while closed', () => {
    const { instance } = breaker();
    failTimes(instance, 4);

    instance.succeeded();
    failTimes(instance, 4);

    expect(instance.state()).toBe('closed');
    expect(instance.snapshot().failures).toBe(4);
  });

  it('reports every transition once, with the new snapshot', () => {
    const onChange = jest.fn();
    const { instance, clock } = breaker(onChange);

    failTimes(instance, 4);
    expect(onChange).not.toHaveBeenCalled();
    failTimes(instance, 1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'open' }));

    clock.now += 30_000;
    instance.state();
    instance.state();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'half-open' }));

    instance.admit();
    instance.succeeded();
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'closed', failures: 0 }),
    );
  });

  it('reports the half-open step when a call arrives after openMs', () => {
    const onChange = jest.fn();
    const { instance, clock } = breaker(onChange);
    failTimes(instance, 5);
    onChange.mockClear();

    clock.now += 30_000;
    instance.admit();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ state: 'half-open' }));
  });

  it('ignores a success or a failure that arrives while it is open', () => {
    const { instance } = breaker();
    failTimes(instance, 5);

    instance.succeeded();
    instance.failed();

    expect(instance.state()).toBe('open');
    expect(instance.snapshot().failures).toBe(5);
  });

  it('uses the defaults when no options are given', () => {
    const instance = new CircuitBreaker('viajes');

    for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD - 1; i++) instance.failed();
    expect(instance.state()).toBe('closed');
    instance.failed();

    expect(instance.state()).toBe('open');
    expect(DEFAULT_OPEN_MS).toBe(30_000);
  });
});

describe('isCircuitFailure', () => {
  it('counts a missing answer, a 429 and any 5xx as a failure', () => {
    for (const status of [null, 429, 500, 502, 503, 504]) {
      expect(isCircuitFailure(status)).toBe(true);
    }
  });

  it('does not count an answer from a healthy service', () => {
    for (const status of [200, 201, 204, 400, 401, 403, 404, 409, 422]) {
      expect(isCircuitFailure(status)).toBe(false);
    }
  });
});

describe('circuitOptionsFromEnv', () => {
  it('reads valid numbers', () => {
    expect(
      circuitOptionsFromEnv({ CIRCUIT_FAILURE_THRESHOLD: '3', CIRCUIT_OPEN_MS: '1000' }),
    ).toEqual({ failureThreshold: 3, openMs: 1000 });
  });

  it('leaves out what is missing, not numeric or not positive', () => {
    expect(circuitOptionsFromEnv({})).toEqual({});
    expect(
      circuitOptionsFromEnv({ CIRCUIT_FAILURE_THRESHOLD: 'abc', CIRCUIT_OPEN_MS: '0' }),
    ).toEqual({});
    expect(
      circuitOptionsFromEnv({ CIRCUIT_FAILURE_THRESHOLD: '-2', CIRCUIT_OPEN_MS: '1.5' }),
    ).toEqual({});
    expect(
      circuitOptionsFromEnv({ CIRCUIT_FAILURE_THRESHOLD: '', CIRCUIT_OPEN_MS: '500' }),
    ).toEqual({
      openMs: 500,
    });
  });
});
