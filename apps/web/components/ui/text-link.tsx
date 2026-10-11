import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  primary: 'text-primary hover:text-primary-hover focus-visible:outline-ring',
  coral: 'text-coral-700 hover:text-coral-900 focus-visible:outline-coral-700',
  light:
    'text-sidebar-foreground hover:text-sidebar-accent-foreground focus-visible:outline-sidebar-ring',
} as const;

const SIZES = { sm: 'text-[13px]', md: 'text-[15px]' } as const;

interface TextLinkProps extends ComponentProps<typeof Link> {
  // `coral` and `light` are for coral and dark backgrounds, where the indigo would not read.
  tone?: keyof typeof TONES;
  size?: keyof typeof SIZES;
}

// A link inside running text; keeps the focus ring of the design system instead of the browser's.
export function TextLink({ className, tone = 'primary', size = 'sm', ...props }: TextLinkProps) {
  return (
    <Link
      className={cn(
        'rounded-sm leading-[normal] font-semibold',
        SIZES[size],
        TONES[tone],
        'outline-offset-2 focus-visible:outline-2',
        className,
      )}
      {...props}
    />
  );
}
