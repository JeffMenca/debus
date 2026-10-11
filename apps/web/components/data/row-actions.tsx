'use client';

import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface RowAction {
  label: string;
  onSelect: () => void;
  tone?: 'danger';
  hidden?: boolean;
}

interface RowActionsProps {
  label: string;
  actions: RowAction[];
}

export function RowActions({ label, actions }: RowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Acciones de ${label}`} className="h-9 w-9">
          <MoreHorizontal aria-hidden strokeWidth={1.75} className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-48">
        {actions
          .filter((action) => !action.hidden)
          .map((action) => (
            <DropdownMenuItem
              key={action.label}
              onSelect={action.onSelect}
              className={action.tone === 'danger' ? 'text-rose-700' : undefined}
            >
              {action.label}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
