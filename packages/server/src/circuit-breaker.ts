import type { BackendService, Circuit, CircuitState } from '@debus/contracts';
import { CircuitOpenError } from './service-errors';

export const DEFAULT_FAILURE_THRESHOLD = 5;
export const DEFAULT_OPEN_MS = 30_000;

export interface CircuitOptions {
  failureThreshold?: number;
  openMs?: number;
  now?: () => number;
}

// A peer that did not answer, or answered 429 or 5xx, is failing; any other answer means it is healthy.
export const isCircuitFailure = (status: number | null): boolean =>
  status === null || status === 429 || status >= 500;

const positiveInteger = (raw: string | undefined): number | undefined => {
  const value = Number(raw);
  return raw !== undefined && Number.isInteger(value) && value > 0 ? value : undefined;
};

export function circuitOptionsFromEnv(
  env: Record<string, string | undefined>,
): Pick<CircuitOptions, 'failureThreshold' | 'openMs'> {
  const failureThreshold = positiveInteger(env.CIRCUIT_FAILURE_THRESHOLD);
  const openMs = positiveInteger(env.CIRCUIT_OPEN_MS);
  return {
    ...(failureThreshold !== undefined && { failureThreshold }),
    ...(openMs !== undefined && { openMs }),
  };
}

// No timers: the step from open to half-open is worked out when the state is asked for.
export class CircuitBreaker {
  private current: CircuitState = 'closed';
  private failures = 0;
  private retryAt = 0;
  private probing = false;
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private readonly now: () => number;

  constructor(
    private readonly target: BackendService,
    options: CircuitOptions = {},
    private readonly onChange?: (snapshot: Circuit) => void,
  ) {
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.openMs = options.openMs ?? DEFAULT_OPEN_MS;
    this.now = options.now ?? Date.now;
  }

  state(): CircuitState {
    if (this.current === 'open' && this.now() >= this.retryAt) {
      this.current = 'half-open';
      this.probing = false;
      this.onChange?.(this.view());
    }
    return this.current;
  }

  // Lets the call through, or throws if the circuit is open or its single probe is already out.
  admit(): void {
    const state = this.state();
    if (state === 'closed') return;
    if (state === 'half-open' && !this.probing) {
      this.probing = true;
      return;
    }
    throw new CircuitOpenError(this.target, new Date(this.retryAt));
  }

  succeeded(): void {
    const state = this.state();
    if (state === 'open') return;
    this.failures = 0;
    this.probing = false;
    if (state === 'half-open') this.transition('closed');
  }

  failed(): void {
    const state = this.state();
    if (state === 'open') return;
    this.failures += 1;
    if (state === 'half-open' || this.failures >= this.failureThreshold) {
      this.retryAt = this.now() + this.openMs;
      this.probing = false;
      this.transition('open');
    }
  }

  snapshot(): Circuit {
    this.state();
    return this.view();
  }

  private view(): Circuit {
    return {
      target: this.target,
      state: this.current,
      failures: this.failures,
      retryAt: this.current === 'closed' ? null : new Date(this.retryAt).toISOString(),
    };
  }

  private transition(next: CircuitState): void {
    this.current = next;
    this.onChange?.(this.view());
  }
}
