'use client';

import { todayInGuatemala } from '@debus/contracts';
import { CalendarRange } from 'lucide-react';
import { useState } from 'react';
import { DateField } from '@/components/forms/date-field';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type ReportRange, rangeLabel } from '@/lib/reports/range';

const draftOf = (range: ReportRange): Required<ReportRange> => {
  const today = todayInGuatemala();
  return { from: range.from ?? today, to: range.to ?? range.from ?? today };
};

interface ReportRangeFieldProps {
  range: ReportRange;
  onChange: (range: ReportRange) => void;
}

// The report starts with every record; opening the picker proposes today, as every date does.
export function ReportRangeField({ range, onChange }: ReportRangeFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Required<ReportRange>>(() => draftOf(range));
  const narrowed = Boolean(range.from || range.to);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(draftOf(range));
        setOpen(next);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" id="report-period-label">
          Periodo
        </span>
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            aria-labelledby="report-period-label report-period-value"
            className="justify-start"
          >
            <CalendarRange aria-hidden strokeWidth={1.75} className="size-4.5 text-primary" />
            <span id="report-period-value">{rangeLabel(range)}</span>
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent align="start" className="flex w-[min(340px,calc(100vw-32px))] flex-col gap-3">
        <DateField
          id="report-from"
          label="Desde"
          value={draft.from}
          max={draft.to}
          hint="Primer día del periodo"
          onChange={(from) => setDraft({ ...draft, from })}
        />
        <DateField
          id="report-to"
          label="Hasta"
          value={draft.to}
          min={draft.from}
          hint="Último día del periodo"
          onChange={(to) => setDraft({ ...draft, to })}
        />
        <div className="flex flex-wrap justify-end gap-2">
          {narrowed && (
            <Button
              variant="ghost"
              onClick={() => {
                onChange({});
                setOpen(false);
              }}
            >
              Ver todos los registros
            </Button>
          )}
          <Button
            disabled={!draft.from || !draft.to || draft.to < draft.from}
            onClick={() => {
              onChange(draft);
              setOpen(false);
            }}
          >
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
