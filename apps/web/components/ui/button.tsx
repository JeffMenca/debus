import { type VariantProps, cva } from 'class-variance-authority';
import { ArrowRight } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'group inline-flex items-center justify-center gap-2 rounded-lg text-[15px] font-semibold whitespace-nowrap',
    'cursor-pointer transition-[background-color,color,transform] duration-200',
    'hover:-translate-y-px active:scale-[0.97]',
    'outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
    'disabled:pointer-events-none disabled:translate-y-0 disabled:bg-muted-2 disabled:text-muted-foreground/70',
    'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
  ],
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        accent: 'bg-mango-300 text-foreground hover:brightness-95',
        ghost: 'bg-transparent text-foreground hover:bg-muted disabled:bg-transparent',
        destructive: 'bg-destructive text-destructive-foreground hover:brightness-90',
        coral: 'bg-coral-700 text-white hover:brightness-90',
      },
      size: {
        default: 'h-11.5 px-5',
        lg: 'h-12.5 px-5',
        icon: 'h-11.5 w-11.5 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  // Adds the arrow that slides 4px on hover; not combinable with asChild.
  arrow?: boolean;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  arrow = false,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button className={classes} {...props}>
      {children}
      {arrow && (
        <ArrowRight
          aria-hidden
          strokeWidth={1.75}
          className="size-4.5 transition-transform duration-300 ease-[var(--ease-spring)] group-hover:translate-x-1 motion-reduce:transition-none"
        />
      )}
    </button>
  );
}

export { Button, buttonVariants };
