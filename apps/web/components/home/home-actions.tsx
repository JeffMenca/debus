'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { homePathFor } from '@/lib/auth/home-path';
import { signOut } from '@/lib/auth/session-client';
import { useSession, useSessionStatus } from '@/lib/auth/session-store';

// Below sm the three controls must share one row with the logo, so they are smaller.
const SIZE = 'shrink-0 h-10 text-[13px] sm:h-11.5 sm:text-[15px]';
const PRIMARY = `${SIZE} px-2.5 sm:px-5`;
const PLAIN = `${SIZE} px-2 sm:px-5`;

// Under 380px the actions take their own row in every state, so the header keeps its height when
// the session check ends. From 380px they share the logo's row and its free width, truncating the
// greeting instead of wrapping. The first control's auto start margin (not `justify-end`) makes
// any overflow spill to the right, never over the logo.
const AREA = 'min-w-0 grow basis-full min-[380px]:basis-0';
const NAV = `${AREA} flex items-center gap-1 sm:gap-2 [&>:first-child]:ml-auto`;

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0];
}

// The entry points of the home page: they depend on whether somebody is signed in.
export function HomeActions() {
  const session = useSession();
  const status = useSessionStatus();
  const loginLink = useRef<HTMLAnchorElement>(null);
  const signedOutHere = useRef(false);

  // The sign-out button disappears with the session; the focus must not fall back to the body.
  useEffect(() => {
    if (!signedOutHere.current || session) return;
    signedOutHere.current = false;
    loginLink.current?.focus();
  }, [session]);

  async function handleSignOut() {
    signedOutHere.current = true;
    await signOut();
  }

  if (status === 'unknown') {
    return <Skeleton className={`${AREA} ml-auto h-10 max-w-[193px] sm:h-11.5 sm:max-w-[265px]`} />;
  }

  if (!session) {
    return (
      <nav aria-label="Acceso" className={NAV}>
        <Button asChild variant="secondary" className={`${PLAIN} max-sm:bg-transparent`}>
          <Link ref={loginLink} href="/login">
            Iniciar sesión
          </Link>
        </Button>
        <Button asChild className={PRIMARY}>
          <Link href="/registro">Crear cuenta</Link>
        </Button>
      </nav>
    );
  }

  const { role, fullName } = session.user;
  return (
    <nav aria-label="Tu cuenta" className={NAV}>
      {role === 'CLIENT' ? (
        <p className="min-w-0 truncate font-semibold text-foreground">
          Hola, {firstName(fullName)}
        </p>
      ) : (
        <Button asChild className={PRIMARY}>
          <Link href={homePathFor(role)}>Ir a mi panel</Link>
        </Button>
      )}
      <Button variant="ghost" className={PLAIN} onClick={handleSignOut}>
        Cerrar sesión
      </Button>
    </nav>
  );
}
