'use client';

import { PAGE_SIZE_OPTIONS } from '@debus/contracts';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCount } from '@/lib/format';

interface TablePaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  from: number;
  to: number;
  canPrevious: boolean;
  canNext: boolean;
  onFirst: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onLast: () => void;
  onPageSizeChange: (pageSize: number) => void;
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="size-11"
    >
      {children}
    </Button>
  );
}

const ICON = { 'aria-hidden': true, strokeWidth: 1.75, className: 'size-5' } as const;

export function TablePagination({
  page,
  pageCount,
  pageSize,
  total,
  from,
  to,
  canPrevious,
  canNext,
  onFirst,
  onPrevious,
  onNext,
  onLast,
  onPageSizeChange,
}: TablePaginationProps) {
  return (
    <nav
      aria-label="Paginación"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2 pb-1 text-[13px] text-muted-foreground"
    >
      <span className="tabular-nums">{`Mostrando ${formatCount(from)}–${formatCount(to)} de ${formatCount(total)}`}</span>
      <div className="flex items-center gap-1">
        <div className="mr-2 hidden items-center gap-2 sm:flex">
          <span aria-hidden>Filas por página</span>
          <div className="w-24">
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger aria-label="Filas por página" size="sm" className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <PageButton label="Primera página" disabled={!canPrevious} onClick={onFirst}>
          <ChevronsLeft {...ICON} />
        </PageButton>
        <PageButton label="Página anterior" disabled={!canPrevious} onClick={onPrevious}>
          <ChevronLeft {...ICON} />
        </PageButton>
        <span aria-live="polite" className="px-2 tabular-nums text-foreground">
          {`Página ${formatCount(page)} de ${formatCount(pageCount)}`}
        </span>
        <PageButton label="Página siguiente" disabled={!canNext} onClick={onNext}>
          <ChevronRight {...ICON} />
        </PageButton>
        <PageButton label="Última página" disabled={!canNext} onClick={onLast}>
          <ChevronsRight {...ICON} />
        </PageButton>
      </div>
    </nav>
  );
}
