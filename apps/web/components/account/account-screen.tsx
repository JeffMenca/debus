'use client';

import { StatusTabs } from '@/components/data/status-tabs';
import { TopUpCard } from '@/components/wallet/top-up-card';
import { MovementsList } from '@/components/wallet/movements-list';
import { WalletCard } from '@/components/wallet/wallet-card';
import { useUrlQuery } from '@/hooks/use-url-query';
import {
  type AccountTab,
  readAccountView,
  writeAccountView,
} from '@/lib/account/account-view-params';
import { ProfileCard } from './profile-card';

const TABS: { value: AccountTab; label: string }[] = [
  { value: 'TICKETS', label: 'Boletos' },
  { value: 'RENTALS', label: 'Alquileres' },
  { value: 'MOVEMENTS', label: 'Movimientos' },
];

function EmptyTab({ children }: { children: string }) {
  return (
    <p className="rounded-3xl bg-card px-6 py-10 text-center text-muted-foreground">{children}</p>
  );
}

export function AccountScreen() {
  const [view, update] = useUrlQuery(readAccountView, writeAccountView);
  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <WalletCard />
        <TopUpCard />
        <ProfileCard />
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-[36px] leading-none font-bold sm:text-[44px]">
            Mis viajes
          </h1>
          <StatusTabs
            label="Secciones de tu cuenta"
            value={view.tab}
            options={TABS}
            onChange={(tab) => update({ tab })}
          />
        </div>
        {view.tab === 'TICKETS' && (
          <EmptyTab>
            Aquí verás los boletos que compres, también los de ventanilla con tu NIT.
          </EmptyTab>
        )}
        {view.tab === 'RENTALS' && (
          <EmptyTab>Aquí verás los buses que alquiles para tu grupo.</EmptyTab>
        )}
        {view.tab === 'MOVEMENTS' && (
          <MovementsList
            query={{ kind: view.kind, page: view.page, pageSize: view.pageSize }}
            onChange={update}
          />
        )}
      </div>
    </div>
  );
}
