import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-shimmer rounded-lg bg-[linear-gradient(90deg,var(--muted)_0%,var(--card)_50%,var(--muted)_100%)] bg-[length:200%_100%] motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}
