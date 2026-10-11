'use client';

import type { UserRole } from '@debus/contracts';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FRIENDLY_NETWORK_MESSAGE } from '@/lib/api/api-error';
import { homePathFor } from '@/lib/auth/home-path';
import { refreshSession } from '@/lib/auth/session-client';
import { useSession, useSessionStatus } from '@/lib/auth/session-store';
import { FormAlert } from './form-alert';

function Page({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-7">
      <div className="flex w-full max-w-[450px] animate-arrive flex-col gap-4 rounded-[28px] bg-card p-8 motion-reduce:animate-none">
        {children}
      </div>
    </main>
  );
}

function Unavailable() {
  const [retrying, setRetrying] = useState(false);
  return (
    <Page>
      <h1 className="text-[32px] leading-[normal] font-bold">No pudimos conectarnos</h1>
      <FormAlert tone="error">{FRIENDLY_NETWORK_MESSAGE}</FormAlert>
      <Button
        disabled={retrying}
        onClick={async () => {
          setRetrying(true);
          await refreshSession();
          setRetrying(false);
        }}
      >
        {retrying ? 'Reintentando...' : 'Reintentar'}
      </Button>
    </Page>
  );
}

// Guards a section on the client: no session goes to the login, another role to its own home.
export function RoleGate({
  allowed,
  children,
}: {
  allowed: readonly UserRole[];
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const status = useSessionStatus();
  const permitted = Boolean(session && allowed.includes(session.user.role));

  useEffect(() => {
    if (status !== 'ready') return;
    if (!session) router.replace(`/login?siguiente=${encodeURIComponent(pathname)}`);
    else if (!permitted) router.replace(homePathFor(session.user.role));
  }, [status, session, permitted, pathname, router]);

  if (!session) return status === 'unavailable' ? <Unavailable /> : null;
  if (!permitted) return null;
  return <>{children}</>;
}
