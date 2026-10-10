import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends ComponentProps<'input'> {
  // Decorative icon on the left, in the brand color.
  icon?: LucideIcon;
  // Control pinned to the right edge (for example the show/hide eye).
  trailing?: ReactNode;
}

export function Input({ className, icon: Icon, trailing, ...props }: InputProps) {
  const input = (
    <input
      className={cn(
        'h-11.5 w-full appearance-none rounded-lg border-0 bg-muted px-3.5 text-[15px] font-medium text-foreground',
        'transition-[background-color,box-shadow] duration-200 placeholder:text-muted-foreground/80',
        'hover:bg-muted-2 focus:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
        'aria-invalid:ring-2 aria-invalid:ring-rose-300 aria-invalid:ring-inset',
        'motion-reduce:transition-none',
        Icon && 'pl-10.5',
        trailing && 'pr-13',
        className,
      )}
      {...props}
    />
  );
  if (!Icon && !trailing) return input;
  return (
    <div className="relative">
      {Icon && (
        <Icon
          aria-hidden
          strokeWidth={1.75}
          className="pointer-events-none absolute top-1/2 left-3.25 size-5 -translate-y-1/2 text-primary"
        />
      )}
      {input}
      {trailing}
    </div>
  );
}
