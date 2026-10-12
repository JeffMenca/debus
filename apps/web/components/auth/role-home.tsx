'use client';

import { useSession } from '@/lib/auth/session-store';

// Placeholder start page, shown inside the shell until the real panels exist.
export function RoleHome() {
  const session = useSession();
  if (!session) return null;
  return (
    <section className="flex animate-arrive flex-col gap-2 rounded-[26px] bg-card p-7 motion-reduce:animate-none">
      <h1 className="font-display text-[32px] leading-[normal] font-bold">
        Hola, {session.user.fullName}
      </h1>
      <p className="text-[15px] text-muted-foreground">Pronto verás aquí tu panel.</p>
    </section>
  );
}
