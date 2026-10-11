import type { UserRole } from '@debus/contracts';
import { useSession, useSessionStatus } from '@/lib/auth/session-store';

export type Audience = 'checking' | 'visitor' | UserRole;

// Who is looking at a public page: nobody known yet, a visitor, or a signed-in role. An
// unreachable service counts as a visitor, the same as in the header.
export function useAudience(): Audience {
  const session = useSession();
  const status = useSessionStatus();

  if (status === 'unknown') return 'checking';
  return session ? session.user.role : 'visitor';
}
