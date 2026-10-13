import { useSession } from '@/lib/auth/session-store';
import { useBranch } from './use-branches';

// The branch of the person signed in, for the headings of branch screens.
export function useOwnBranch() {
  return useBranch(useSession()?.user.branchId ?? null).data;
}
