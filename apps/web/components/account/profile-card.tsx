'use client';

import { useState } from 'react';
import { ErrorAlert } from '@/components/data/error-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isAccountPending } from '@/lib/account/account-state';
import { formatDpi, formatNit } from '@/lib/account/formats';
import { useProfile } from '@/lib/account/profile-api';
import { messageOf } from '@/lib/api/client';
import { formatPhone, initialsOf } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AccountPending } from './account-pending';
import { ProfileDialog } from './profile-dialog';

function Detail({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('m-0 min-w-0 break-words', mono && value && 'font-mono')}>
        {value ?? <span className="text-muted-foreground">Sin registrar</span>}
      </dd>
    </>
  );
}

export function ProfileCard() {
  const profile = useProfile();
  const [editing, setEditing] = useState(false);
  const data = profile.data;

  return (
    <section
      aria-labelledby="profile-title"
      className="flex animate-arrive flex-col gap-4 rounded-[26px] bg-card p-6 [animation-delay:120ms] motion-reduce:animate-none"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="profile-title" className="font-display text-[22px] font-bold">
          Perfil
        </h2>
        {data && (
          <Button variant="secondary" className="h-10 px-4" onClick={() => setEditing(true)}>
            Editar
          </Button>
        )}
      </div>
      {profile.isPending && <Skeleton className="h-40 w-full" />}
      {profile.isError &&
        (isAccountPending(profile.error) ? (
          <AccountPending onRetry={() => profile.refetch()} />
        ) : (
          <ErrorAlert message={messageOf(profile.error)} onRetry={() => profile.refetch()} />
        ))}
      {data && (
        <>
          <div className="flex min-w-0 items-center gap-3.5">
            <span
              aria-hidden
              className="flex size-[54px] shrink-0 items-center justify-center rounded-full bg-lilac-100 text-lg font-bold text-lilac-700"
            >
              {initialsOf(data.fullName)}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[17px] font-bold">{data.fullName}</span>
              <span className="truncate text-sm text-muted-foreground">{data.email}</span>
            </div>
          </div>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 text-sm">
            <Detail label="NIT" value={data.nit && formatNit(data.nit)} mono />
            <Detail label="DPI" value={data.dpi && formatDpi(data.dpi)} mono />
            <Detail label="Teléfono" value={data.phone && formatPhone(data.phone)} mono />
            <Detail label="Dirección" value={data.address} />
          </dl>
          <ProfileDialog open={editing} onOpenChange={setEditing} profile={data} />
        </>
      )}
    </section>
  );
}
