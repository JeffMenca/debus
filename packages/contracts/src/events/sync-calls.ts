import type { BackendService } from '../topology';
import { EVENT_REGISTRY, EVENT_TYPES } from './registry';

export interface SyncCall {
  readonly from: BackendService;
  readonly to: BackendService;
  readonly purpose: string;
}

export const SYNC_CALLS: readonly SyncCall[] = [
  { from: 'ventas', to: 'clientes', purpose: 'Debit the wallet with an Idempotency-Key' },
  { from: 'ventas', to: 'viajes', purpose: 'Check the trip is open for sale' },
  { from: 'viajes', to: 'flota', purpose: 'Check bus and driver availability' },
  { from: 'clientes', to: 'flota', purpose: 'Check bus availability for a rental' },
];

// At least half of the inter-service communication must be event driven.
export function eventDrivenShare(): number {
  const events = EVENT_TYPES.filter((type) => !EVENT_REGISTRY[type].diagnostic).length;
  return events / (events + SYNC_CALLS.length);
}
