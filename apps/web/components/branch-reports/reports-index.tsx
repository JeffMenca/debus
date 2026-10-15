'use client';

import Link from 'next/link';
import { KPI_TONE_SURFACES } from '@/components/data/kpi-card';
import { PageHeader } from '@/components/layout/page-header';
import { useOwnBranch } from '@/hooks/use-own-branch';
import { REPORT_LINKS } from '@/lib/branch-reports/report-links';
import { cn } from '@/lib/utils';

export function ReportsIndex() {
  const branch = useOwnBranch();
  return (
    <>
      <PageHeader eyebrow={branch ? `Reportes · ${branch.name}` : 'Reportes'} title="Reportes" />
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-3.5">
        {REPORT_LINKS.map(({ title, href, description, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                'lift flex h-full flex-col gap-2 rounded-[22px] p-5 outline-offset-2 transition hover:-translate-y-1 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                KPI_TONE_SURFACES.lilac,
              )}
            >
              <Icon aria-hidden strokeWidth={1.75} className="size-6" />
              <span className="font-display text-xl font-bold">{title}</span>
              <span className="text-sm font-medium">{description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
