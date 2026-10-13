'use client';

import { todayInGuatemala } from '@debus/contracts';
import { CalendarDays, IdCard, Plus } from 'lucide-react';
import { useState } from 'react';
import { KpiCard } from '@/components/data/kpi-card';
import { KpiSkeleton } from '@/components/data/kpi-skeleton';
import { DateField } from '@/components/forms/date-field';
import { PageHeader } from '@/components/layout/page-header';
import { ScheduleTripDialog } from '@/components/trips/schedule-trip-dialog';
import { Button } from '@/components/ui/button';
import { useExpiringDrivers } from '@/hooks/use-drivers';
import { useTripsPage } from '@/hooks/use-trips';
import { useSession } from '@/lib/auth/session-store';
import { SOON_LICENSE_DAYS } from '@/lib/fleet/license';
import { greetingFor, longDayHeading } from '@/lib/greeting';
import { ExpiringLicenses } from './expiring-licenses';
import { OnTheRoad } from './on-the-road';
import { UpcomingDepartures, departuresOf } from './upcoming-departures';

const unknown = () => '—';

export function BranchDashboard() {
  const session = useSession();
  const today = todayInGuatemala();
  const [day, setDay] = useState(today);
  const [scheduling, setScheduling] = useState(false);
  const departures = useTripsPage(departuresOf(day));
  const licences = useExpiringDrivers(SOON_LICENSE_DAYS);
  const firstName = session?.user.fullName.split(' ')[0] ?? '';

  return (
    <>
      <PageHeader
        eyebrow={longDayHeading(day)}
        title={`${greetingFor()}, ${firstName}`}
        actions={
          <div className="flex flex-wrap items-start gap-2.5">
            <div className="w-full sm:w-48">
              <DateField
                id="branch-day"
                label="Día"
                value={day}
                hint="Hoy por defecto, siempre editable"
                onChange={(next) => setDay(next || today)}
              />
            </div>
            <Button className="sm:mt-[22px]" onClick={() => setScheduling(true)}>
              <Plus aria-hidden strokeWidth={1.75} className="size-4.5" />
              Programar viaje
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3.5">
        {departures.isPending ? (
          <KpiSkeleton />
        ) : (
          <KpiCard
            tone="indigo"
            icon={CalendarDays}
            label={day === today ? 'Salidas programadas hoy' : 'Salidas programadas ese día'}
            value={departures.data?.total ?? 0}
            format={departures.isError ? unknown : undefined}
          />
        )}
        {licences.isPending ? (
          <KpiSkeleton />
        ) : (
          <KpiCard
            tone="coral"
            icon={IdCard}
            label="Licencias por vencer"
            value={licences.data?.total ?? 0}
            format={licences.isError ? unknown : undefined}
          />
        )}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
          <OnTheRoad />
          <UpcomingDepartures day={day} />
        </div>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <ExpiringLicenses />
        </div>
      </div>

      <ScheduleTripDialog
        open={scheduling}
        onOpenChange={setScheduling}
        defaultDay={day > today ? day : today}
      />
    </>
  );
}
