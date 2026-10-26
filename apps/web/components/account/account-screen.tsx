'use client';

import { StatusTabs } from '@/components/data/status-tabs';
import { RentalHistory } from '@/components/rentals/rental-history';
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
import { TicketHistory } from './ticket-history';

const TABS: { value: AccountTab; label: string }[] = [
  { value: 'TICKETS', label: 'Boletos' },
  { value: 'RENTALS', label: 'Alquileres' },
  { value: 'MOVEMENTS', label: 'Movimientos' },
];

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
          <TicketHistory query={{ page: view.page, pageSize: view.pageSize }} onChange={update} />
        )}
        {view.tab === 'RENTALS' && (
          <RentalHistory query={{ page: view.page, pageSize: view.pageSize }} onChange={update} />
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
