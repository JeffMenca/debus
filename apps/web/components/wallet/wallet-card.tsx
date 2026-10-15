'use client';

import { Wallet } from 'lucide-react';
import { ErrorAlert } from '@/components/data/error-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useCountUp } from '@/hooks/use-count-up';
import { messageOf } from '@/lib/api/client';
import { formatQuetzales } from '@/lib/format';
import { useWallet } from '@/lib/wallet/wallet-api';

function Balance({ value }: { value: number }) {
  const shown = useCountUp(value);
  return (
    <>
      <span className="sr-only">{formatQuetzales(value)}</span>
      <span
        aria-hidden
        className="font-display text-[44px] leading-none font-bold tabular-nums sm:text-[56px]"
      >
        {formatQuetzales(shown)}
      </span>
    </>
  );
}

export function WalletCard() {
  const wallet = useWallet();
  return (
    <section
      aria-labelledby="wallet-title"
      className="relative flex min-h-[250px] animate-arrive flex-col gap-5.5 overflow-hidden rounded-[30px] bg-primary p-7 text-primary-foreground motion-reduce:animate-none"
    >
      <div
        aria-hidden
        className="absolute -top-9 -right-9 size-[150px] animate-float rounded-full bg-mango-300 motion-reduce:animate-none"
      />
      <svg
        aria-hidden
        viewBox="0 0 600 120"
        preserveAspectRatio="none"
        className="absolute bottom-0 left-0 h-[90px] w-[calc(100%+80px)]"
      >
        <path
          d="M0 70 Q75 30 150 70 T300 70 T450 70 T600 70 V120 H0 Z"
          className="fill-primary-foreground/15"
        />
        <path
          d="M0 95 Q75 65 150 95 T300 95 T450 95 T600 95 V120 H0 Z"
          className="fill-lilac-300 opacity-70"
        />
      </svg>
      <h2
        id="wallet-title"
        className="relative flex items-center gap-2.5 font-semibold text-indigo-100"
      >
        <Wallet aria-hidden strokeWidth={1.75} className="size-5" />
        Cartera digital
      </h2>
      <div className="relative flex flex-col gap-1">
        <span className="text-sm text-indigo-100">Saldo disponible</span>
        {wallet.data && <Balance value={wallet.data.balance} />}
        {wallet.isPending && <Skeleton className="h-14 w-56 bg-primary-foreground/20" />}
      </div>
      {wallet.isError && (
        <div className="relative text-foreground">
          <ErrorAlert message={messageOf(wallet.error)} onRetry={() => wallet.refetch()} />
        </div>
      )}
    </section>
  );
}
