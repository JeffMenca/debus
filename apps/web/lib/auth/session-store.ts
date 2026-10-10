import type { WebSession } from '@debus/contracts';
import { useSyncExternalStore } from 'react';

type Status = 'unknown' | 'ready' | 'unavailable';

let current: WebSession | null = null;
let status: Status = 'unknown';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const getSession = (): WebSession | null => current;

export function setSession(session: WebSession): void {
  current = session;
  status = 'ready';
  notify();
}

export function clearSession(): void {
  current = null;
  status = 'ready';
  notify();
}

// The service could not be reached: nothing says the session ended, so it is left as it is.
export function markUnavailable(): void {
  status = 'unavailable';
  notify();
}

export const getSessionStatus = (): Status => status;

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useSession = (): WebSession | null =>
  useSyncExternalStore(subscribeSession, getSession, () => null);

// 'unknown' until the first sign-in or refresh attempt has finished; 'unavailable' while the
// service cannot be reached.
export const useSessionStatus = (): Status =>
  useSyncExternalStore(subscribeSession, getSessionStatus, () => 'unknown');
