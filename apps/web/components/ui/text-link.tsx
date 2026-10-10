import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// A link inside running forms; keeps the focus ring of the design system instead of the browser's.
export function TextLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        'rounded-sm text-[13px] leading-[normal] font-semibold text-primary hover:text-primary-hover',
        'outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
        className,
      )}
      {...props}
    />
  );
}
