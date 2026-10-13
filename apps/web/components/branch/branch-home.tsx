'use client';

import { RoleHome } from '@/components/auth/role-home';
import { useSession } from '@/lib/auth/session-store';
import { BranchDashboard } from './branch-dashboard';

// Only the branch admin runs the operation; cashiers and drivers keep their welcome for now.
export function BranchHome() {
  const role = useSession()?.user.role;
  return role === 'BRANCH_ADMIN' ? <BranchDashboard /> : <RoleHome />;
}
