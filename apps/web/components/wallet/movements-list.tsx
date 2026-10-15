'use client';

import { type WalletMovement, pageCount } from '@debus/contracts';
import { Minus, Plus } from 'lucide-react';
import { ErrorAlert } from '@/components/data/error-alert';
import { TablePagination } from '@/components/data/table-pagination';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageInRange } from '@/hooks/use-page-in-range';
import type { MovementKindFilter } from '@/lib/account/account-view-params';
import { signedQuetzales } from '@/lib/account/formats';
import { messageOf } from '@/lib/api/client';
import { formatLongDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type MovementsQuery, useWalletMovements } from '@/lib/wallet/wallet-api';

const KIND_OPTIONS: { value: MovementKindFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'TOP_UP', label: 'Recargas' },
  { value: 'TICKET', label: 'Boletos' },
  { value: 'RENTAL', label: 'Alquileres' },
  { value: 'REFUND', label: 'Devoluciones' },
];

function MovementRow({ movement }: { movement: WalletMovement }) {
  const credit = movement.amount > 0;
  const Icon = credit ? Plus : Minus;
  return (
    <li className="flex items-center gap-4 border-b border-border py-4 last:border-b-0">
      <span
        aria-hidden
        className={cn(
          'flex size-[42px] shrink-0 items-center justify-center rounded-[13px]',
          credit ? 'bg-mint-100 text-mint-700' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon strokeWidth={1.75} className="size-[18px]" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold break-words">{movement.description}</span>
        <span className="text-[13px] text-muted-foreground">
          {formatLongDate(movement.occurredOn)}
        </span>
      </div>
      <span
        className={cn(
          'shrink-0 font-mono font-semibold tabular-nums',
          credit ? 'text-mint-700' : 'text-foreground',
        )}
      >
        {signedQuetzales(movement.amount)}
      </span>
    </li>
  );
}

interface MovementsListProps {
  query: MovementsQuery;
  onChange: (patch: Partial<MovementsQuery>) => void;
}

export function MovementsList({ query, onChange }: MovementsListProps) {
  const movements = useWalletMovements(query);
  usePageInRange(movements.data, onChange);
  const data = movements.data;
  const pages = data ? pageCount(data.total, data.pageSize) : 1;
  const before = (query.page - 1) * query.pageSize;

  return (
    <div className="flex flex-col gap-3">
      {/* A select, not tabs: five kinds do not fit side by side on a phone. */}
      <div className="flex items-center gap-3">
        <Label htmlFor="movement-kind" className="shrink-0">
          Tipo de movimiento
        </Label>
        <Select
          value={query.kind}
          onValueChange={(kind) => onChange({ kind: kind as MovementKindFilter })}
        >
          <SelectTrigger id="movement-kind" className="w-full bg-card sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div
        className={cn(
          'rounded-3xl bg-card px-6 py-2 transition-opacity',
          movements.isPlaceholderData && 'opacity-60',
        )}
      >
        {movements.isPending && (
          <div className="flex flex-col gap-3 py-4">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-12 w-full" />
            ))}
          </div>
        )}
        {movements.isError && (
          <div className="py-4">
            <ErrorAlert message={messageOf(movements.error)} onRetry={() => movements.refetch()} />
          </div>
        )}
        {data && data.items.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">
            Todavía no tienes movimientos aquí. Cuando recargues saldo o compres, aparecerán en esta
            lista.
          </p>
        )}
        {data && data.items.length > 0 && (
          <ul aria-label="Movimientos de tu cartera">
            {data.items.map((movement) => (
              <MovementRow key={movement.id} movement={movement} />
            ))}
          </ul>
        )}
      </div>
      {data && data.total > 0 && (
        <TablePagination
          page={query.page}
          pageCount={pages}
          pageSize={query.pageSize}
          total={data.total}
          from={before + 1}
          to={before + data.items.length}
          canPrevious={query.page > 1}
          canNext={query.page < pages}
          onFirst={() => onChange({ page: 1 })}
          onPrevious={() => onChange({ page: query.page - 1 })}
          onNext={() => onChange({ page: query.page + 1 })}
          onLast={() => onChange({ page: pages })}
          onPageSizeChange={(pageSize) => onChange({ pageSize })}
        />
      )}
    </div>
  );
}
