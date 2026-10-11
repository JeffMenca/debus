'use client';

import { Building2, MailOpen, Settings2, TrendingDown, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { KPI_TONE_SURFACES, KpiCard, type KpiTone } from '@/components/data/kpi-card';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBranches } from '@/hooks/use-branches';
import { useSettings } from '@/hooks/use-settings';
import { useUsers } from '@/hooks/use-users';
import { useSession } from '@/lib/auth/session-store';
import { formatQuetzales } from '@/lib/format';

const SHORTCUTS: { href: string; title: string; text: string; icon: LucideIcon; tone: KpiTone }[] =
  [
    {
      href: '/admin/usuarios',
      title: 'Usuarios',
      text: 'Invita y administra al personal',
      icon: Users,
      tone: 'mint',
    },
    {
      href: '/admin/sucursales',
      title: 'Sucursales',
      text: 'Ubica y administra las sucursales',
      icon: Building2,
      tone: 'indigo',
    },
    {
      href: '/admin/configuracion',
      title: 'Configuración',
      text: 'Depreciación y tarifa de alquiler',
      icon: Settings2,
      tone: 'lilac',
    },
  ];

function KpiSkeleton() {
  return (
    <div aria-label="Cargando" className="rounded-[22px] bg-card p-4">
      <Skeleton className="h-[74px]" />
    </div>
  );
}

export function AdminDashboard() {
  const session = useSession();
  const branches = useBranches({ includeInactive: false });
  const users = useUsers();
  const settings = useSettings();
  const firstName = session?.user.fullName.split(' ')[0] ?? '';

  const staff = users.data?.filter((user) => user.role !== 'CLIENT') ?? [];
  const current = settings.data?.current ?? null;

  return (
    <>
      <PageHeader eyebrow="Administración" title={`Hola, ${firstName}`} />

      {settings.data && !current && (
        <section className="flex flex-col items-start gap-3 rounded-[26px] bg-coral-100 p-6 text-coral-700">
          <h2 className="font-display text-xl font-bold">Falta la configuración</h2>
          <p className="max-w-2xl text-[15px]">
            Define cuánto se deprecia cada bus por kilómetro y la tarifa de alquiler. Sin esto no se
            pueden calcular los costos de los viajes.
          </p>
          <Button asChild>
            <Link href="/admin/configuracion">Definir configuración</Link>
          </Button>
        </section>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3">
        {branches.data ? (
          <KpiCard
            tone="indigo"
            icon={Building2}
            label="Sucursales activas"
            value={branches.data.filter((branch) => branch.active).length}
          />
        ) : (
          <KpiSkeleton />
        )}
        {users.data ? (
          <KpiCard
            tone="mint"
            icon={Users}
            label="Usuarios activos"
            value={staff.filter((user) => user.status === 'ACTIVE').length}
          />
        ) : (
          <KpiSkeleton />
        )}
        {users.data ? (
          <KpiCard
            tone="mango"
            icon={MailOpen}
            label="Invitaciones pendientes"
            value={staff.filter((user) => user.status === 'PENDING').length}
          />
        ) : (
          <KpiSkeleton />
        )}
        {settings.data ? (
          <KpiCard
            tone="lilac"
            icon={TrendingDown}
            label="Depreciación por km"
            value={current?.depreciationPerKm ?? 0}
            format={current ? formatQuetzales : () => 'Sin definir'}
          />
        ) : (
          <KpiSkeleton />
        )}
      </div>

      <section aria-labelledby="quick-access" className="flex flex-col gap-3">
        <h2 id="quick-access" className="font-display text-xl font-bold">
          Accesos rápidos
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          {SHORTCUTS.map(({ href, title, text, icon: Icon, tone }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col gap-3 rounded-[22px] bg-card p-5 transition hover:-translate-y-1 hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span
                className={`flex size-11 items-center justify-center rounded-[14px] ${KPI_TONE_SURFACES[tone]}`}
              >
                <Icon aria-hidden strokeWidth={1.75} className="size-5" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-display text-lg font-bold">{title}</span>
                <span className="text-sm text-muted-foreground">{text}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
