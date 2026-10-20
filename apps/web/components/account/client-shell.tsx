'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { Logo } from '@/components/brand/logo';
import { isActivePath } from '@/lib/navigation';
import { cn } from '@/lib/utils';

// Only screens that exist are listed; each new client screen adds its link here.
const LINKS = [
  { href: '/viajes', label: 'Viajes' },
  { href: '/cuenta', label: 'Mi cuenta' },
];

export function ClientShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 py-4.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-4 sm:gap-7">
          <Link href="/" aria-label="debus, página de inicio" className="rounded-[14px]">
            <Logo compact />
          </Link>
          <nav aria-label="Tu cuenta" className="flex flex-wrap gap-1">
            {LINKS.map((link) => {
              const active = isActivePath(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-xl px-3.5 py-2.5 text-[15px] font-medium transition-colors hover:bg-muted',
                    active && 'bg-card font-semibold',
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-[1240px] px-4 pt-2 pb-20 sm:px-6">{children}</main>
    </div>
  );
}
