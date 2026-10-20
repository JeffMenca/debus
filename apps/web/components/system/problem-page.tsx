'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { TextLink } from '@/components/ui/text-link';
import { startPathFor } from '@/lib/auth/home-path';
import { useSession } from '@/lib/auth/session-store';

interface ProblemPageProps {
  title: string;
  children: ReactNode;
  actions: ReactNode;
}

// What the person sees when a page cannot be shown: what happened, in plain words, and a way out.
export function ProblemPage({ title, children, actions }: ProblemPageProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <section className="flex w-full max-w-lg flex-col items-start gap-5 rounded-xl bg-coral-100 p-6 sm:p-10">
        <Logo />
        <h1 className="font-display text-3xl font-bold text-balance text-coral-900 sm:text-4xl">
          {title}
        </h1>
        <p className="text-lg leading-relaxed text-coral-900">{children}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">{actions}</div>
      </section>
    </main>
  );
}

// The start of the person who is looking at the page: their own area once the session is known.
// `quiet` is a plain link, for when another action on the page is the primary one.
export function HomeLink({ quiet = false }: { quiet?: boolean }) {
  const href = startPathFor(useSession()?.user.role);
  if (quiet) {
    return (
      <TextLink href={href} size="md">
        Ir al inicio
      </TextLink>
    );
  }
  return (
    <Button asChild>
      <Link href={href}>Ir al inicio</Link>
    </Button>
  );
}
