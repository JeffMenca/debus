'use client';

import type { AccountLinkPurpose } from '@debus/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { messageOf } from '@/lib/api/api-error';
import { linkStatus, renewLink } from '@/lib/auth/auth-api';
import { AuthCard } from './auth-card';
import { CheckEmail } from './check-email';
import { FormAlert } from './form-alert';

export type LinkGateChildren = ReactNode | ((api: { recheck: () => void }) => ReactNode);

interface LinkGateProps {
  token: string | null;
  purpose: AccountLinkPurpose;
  children: LinkGateChildren;
}

function LinkLoading() {
  return (
    <AuthCard role="status" aria-label="Revisando tu enlace">
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-11.5 w-full" />
      <Skeleton className="h-11.5 w-full" />
    </AuthCard>
  );
}

function LinkButton({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild size="lg">
      <Link href={href}>{label}</Link>
    </Button>
  );
}

function LinkUnavailable({ error }: { error?: string }) {
  return (
    <AuthCard
      title="No pudimos abrir este enlace"
      subtitle="Revisa que lo copiaste completo o pide uno nuevo."
    >
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <LinkButton href="/recuperar" label="Pedir un enlace nuevo" />
    </AuthCard>
  );
}

function LinkExpired({ token, purpose }: { token: string; purpose: AccountLinkPurpose }) {
  const renew = useMutation({ mutationFn: () => renewLink(token) });
  if (renew.isSuccess) return <CheckEmail kind="renew" purpose={purpose} />;
  return (
    <AuthCard
      title="Este enlace ya venció"
      subtitle="Por seguridad los enlaces duran poco. Te enviamos uno nuevo con un clic."
    >
      {renew.isError && <FormAlert tone="error">{messageOf(renew.error)}</FormAlert>}
      <Button size="lg" disabled={renew.isPending} onClick={() => renew.mutate()}>
        {renew.isPending ? 'Enviando...' : 'Enviar un enlace nuevo'}
      </Button>
    </AuthCard>
  );
}

export function LinkGate({ token, purpose, children }: LinkGateProps) {
  const status = useQuery({
    queryKey: ['link-status', token],
    queryFn: () => linkStatus(token as string),
    enabled: Boolean(token),
    retry: false,
  });

  if (!token) return <LinkUnavailable />;
  if (status.isPending) return <LinkLoading />;
  if (status.isError) return <LinkUnavailable error={messageOf(status.error)} />;

  switch (status.data.state) {
    case 'valid':
      return typeof children === 'function'
        ? children({ recheck: () => void status.refetch() })
        : children;
    case 'expired':
      return <LinkExpired token={token} purpose={status.data.purpose ?? purpose} />;
    case 'used':
      return (
        <AuthCard title="Este enlace ya se usó" subtitle="Tu contraseña ya está lista.">
          <LinkButton href="/login" label="Ir a iniciar sesión" />
        </AuthCard>
      );
    case 'invalid':
      return <LinkUnavailable />;
  }
}
