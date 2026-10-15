import { GatewayError } from './gateway-client';

// A conflict that says the copy this request needs has not arrived yet.
export const pendingCopy =
  (...messages: string[]) =>
  (error: unknown): boolean =>
    error instanceof GatewayError &&
    error.status === 409 &&
    messages.some((message) => error.message.startsWith(message));

export const STILL_REGISTERING = 'Estamos terminando de registrar';
export const isPendingRegistration = pendingCopy(STILL_REGISTERING);

export const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface RetryOptions {
  attempts?: number;
  delayMs?: number;
  isPending?: (error: unknown) => boolean;
}

// A service keeps copies of what another one owns, filled by events. Right after the owner creates
// something, the copy may not be there yet and the service answers that it is still registering it.
export async function untilRegistered<T>(
  work: () => Promise<T>,
  { attempts = 30, delayMs = 2_000, isPending = isPendingRegistration }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (!isPending(error) || attempt >= attempts) throw error;
      await sleep(delayMs);
    }
  }
}
