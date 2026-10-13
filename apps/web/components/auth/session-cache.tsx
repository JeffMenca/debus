'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useSession } from '@/lib/auth/session-store';

// What one person loaded (their branch's buses, drivers, trips) must never be shown to the next
// one on the same tab: the loaded data goes when the session ends or changes hands.
export function SessionCache() {
  const client = useQueryClient();
  const userId = useSession()?.user.id ?? null;
  const previous = useRef(userId);

  useEffect(() => {
    if (previous.current !== null && previous.current !== userId) client.clear();
    previous.current = userId;
  }, [client, userId]);

  return null;
}
