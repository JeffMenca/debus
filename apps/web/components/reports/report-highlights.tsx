import { KpiCard, type KpiTone } from '@/components/data/kpi-card';
import { KpiSkeleton } from '@/components/data/kpi-skeleton';

export interface Highlight {
  label: string;
  value: number;
  tone: KpiTone;
  format?: (value: number) => string;
  hint?: string;
}

interface ReportHighlightsProps {
  // Undefined while the report loads: the cards show their skeleton.
  items: Highlight[] | undefined;
  // How many skeleton cards to show while loading.
  placeholders?: number;
}

// The totals of the whole filtered set, never of the visible page.
export function ReportHighlights({ items, placeholders = 2 }: ReportHighlightsProps) {
  return (
    <section
      aria-label="Resumen del reporte"
      className="grid grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] gap-3.5"
    >
      {items
        ? items.map(({ label, ...card }) => <KpiCard key={label} label={label} {...card} />)
        : Array.from({ length: placeholders }, (_, index) => <KpiSkeleton key={index} />)}
    </section>
  );
}
