'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { SessionBootstrap } from '@/components/auth/session-bootstrap';
import { SessionCache } from '@/components/auth/session-cache';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <SessionBootstrap />
      <SessionCache />
      {children}
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
