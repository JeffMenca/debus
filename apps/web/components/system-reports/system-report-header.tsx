import { FileDown } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';

interface SystemReportHeaderProps {
  title: string;
  // What the report covers, after "Reportes ·".
  scope?: string;
  onExport: () => void;
  exporting?: boolean;
  disabled?: boolean;
}

// The only primary button of a report: the PDF with everything the filters leave. The system
// administrator has no index of reports (the menu lists them), so the eyebrow is plain text.
export function SystemReportHeader({
  title,
  scope = 'todas las sucursales',
  onExport,
  exporting,
  disabled,
}: SystemReportHeaderProps) {
  return (
    <PageHeader
      eyebrow={`Reportes · ${scope}`}
      title={title}
      actions={
        <Button onClick={onExport} disabled={disabled || exporting}>
          <FileDown aria-hidden strokeWidth={1.75} className="size-4.5" />
          {exporting ? 'Preparando PDF…' : 'Exportar PDF'}
        </Button>
      }
    />
  );
}
