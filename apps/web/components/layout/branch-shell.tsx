'use client';

import type { ReactNode } from 'react';
import { useBranch } from '@/hooks/use-branches';
import { useSession } from '@/lib/auth/session-store';
import { AppShell } from './app-shell';

// Branch staff see the name of their branch in the sidebar once it has loaded.
export function BranchShell({ children }: { children: ReactNode }) {
  const branch = useBranch(useSession()?.user.branchId ?? null);
  const context = branch.data ? { label: 'Sucursal', value: branch.data.name } : undefined;
  return <AppShell context={context}>{children}</AppShell>;
}
