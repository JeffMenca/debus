'use client';

import { todayInGuatemala } from '@debus/contracts';
import { Info } from 'lucide-react';
import Link from 'next/link';
import { KPI_TONE_SURFACES } from '@/components/data/kpi-card';
import { useExpiringDrivers } from '@/hooks/use-drivers';
import { daysUntil, licenseTone, SOON_LICENSE_DAYS } from '@/lib/fleet/license';
import { formatShortDate } from '@/lib/format';
import { Panel, PanelContent } from './panel';

const SHOWN = 5;

interface ExpiringLicensesProps {
  // The day to count from; Guatemala's today unless a test says otherwise.
  today?: string;
}

export function ExpiringLicenses({ today = todayInGuatemala() }: ExpiringLicensesProps) {
  const drivers = useExpiringDrivers(SOON_LICENSE_DAYS);

  return (
    <Panel title="Licencias por vencer">
      <PanelContent
        query={drivers}
        errorMessage="No pudimos cargar las licencias."
        empty={`Ninguna licencia vence en los próximos ${SOON_LICENSE_DAYS} días.`}
      >
        {({ items, total }) => (
          <>
            <ul className="flex flex-col gap-2">
              {items.slice(0, SHOWN).map((driver) => {
                const days = daysUntil(driver.licenseExpiresOn, today);
                const tone = licenseTone(days);
                const expired = days < 0;
                const year = driver.licenseExpiresOn.slice(0, 4) !== today.slice(0, 4);
                return (
                  <li
                    key={driver.id}
                    aria-label={driver.fullName}
                    className={`flex items-center gap-3.5 rounded-2xl p-2.5 ${KPI_TONE_SURFACES[tone === 'muted' ? 'mango' : tone]}`}
                  >
                    <span className="flex size-[54px] shrink-0 flex-col items-center justify-center rounded-2xl bg-card font-display leading-none">
                      {expired ? (
                        <span className="text-[11px] font-bold">Vencida</span>
                      ) : (
                        <>
                          <span className="text-[22px] font-bold">{days}</span>
                          <span className="font-sans text-[10px] font-bold">
                            {days === 1 ? 'día' : 'días'}
                          </span>
                        </>
                      )}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-bold">{driver.fullName}</span>
                      <span className="text-[13px]">
                        Licencia {driver.licenseType} · {expired ? 'venció' : 'vence'}{' '}
                        {formatShortDate(driver.licenseExpiresOn, year)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {total > SHOWN && (
              <p className="text-[13px] text-muted-foreground">
                Y {total - SHOWN} más. Revísalas en Choferes.
              </p>
            )}
          </>
        )}
      </PanelContent>
      <p className="flex gap-2 text-[13px] leading-normal text-muted-foreground">
        <Info aria-hidden strokeWidth={1.75} className="mt-0.5 size-4 shrink-0" />
        <span>
          Revisa sus datos en{' '}
          <Link href="/sucursal/choferes" className="font-semibold text-primary">
            Choferes
          </Link>
          .
        </span>
      </p>
    </Panel>
  );
}
