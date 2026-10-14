'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

// Before hydration a form would submit natively (a GET that puts its fields in the address).
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
