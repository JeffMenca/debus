import { cn } from '@/lib/utils';

export type StatusTone = 'mint' | 'rose' | 'mango';

const DOT: Record<StatusTone, string> = {
  mint: 'bg-mint-300',
  rose: 'bg-rose-300',
  mango: 'bg-mango-300',
};
const TEXT: Record<StatusTone, string> = {
  mint: 'text-mint-700',
  rose: 'text-rose-700',
  mango: 'text-mango-700',
};

interface StatusDotProps {
  tone: StatusTone;
  label: string;
  live?: boolean;
}

export function StatusDot({ tone, label, live = false }: StatusDotProps) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm font-medium', TEXT[tone])}>
      <span
        aria-hidden
        className={cn(
          'size-2.5 rounded-full',
          DOT[tone],
          live && 'animate-pulse-live motion-reduce:animate-none',
        )}
      />
      {label}
    </span>
  );
}
