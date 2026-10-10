'use client';

import { useEffect } from 'react';
import { refreshSession, startTabSync } from '@/lib/auth/session-client';
import { getSession } from '@/lib/auth/session-store';

// Restores the session after a page reload using the refresh cookie, and follows the other tabs.
export function SessionBootstrap() {
  useEffect(() => {
    const stopSync = startTabSync();
    if (!getSession()) void refreshSession();
    return stopSync;
  }, []);
  return null;
}
