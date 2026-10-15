import { FileDown } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { TextLink } from '@/components/ui/text-link';

interface ReportHeaderProps {
  // The branch the report is about; the title of the report is `title`.
  scope?: string | null;
  title: string;
  onExport: () => void;
  exporting?: boolean;
  disabled?: boolean;
}

// The only primary button of a report: the PDF with everything the filters leave.
export function ReportHeader({ scope, title, onExport, exporting, disabled }: ReportHeaderProps) {
  return (
    <PageHeader
      eyebrow={
        <>
          <TextLink href="/sucursal/reportes" size="md" className="text-muted-foreground">
            Reportes
          </TextLink>
          {scope && ` · ${scope}`}
        </>
      }
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
