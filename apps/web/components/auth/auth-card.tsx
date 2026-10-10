import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AuthCardProps extends Omit<ComponentProps<'div'>, 'title'> {
  title?: string;
  subtitle?: ReactNode;
}

export function AuthCard({ title, subtitle, className, children, ...props }: AuthCardProps) {
  return (
    <div
      className={cn(
        'relative flex w-full max-w-[450px] animate-arrive flex-col gap-6 rounded-[28px] bg-card p-8 [animation-delay:180ms] motion-reduce:animate-none',
        className,
      )}
      {...props}
    >
      {title && (
        <div className="flex flex-col gap-2">
          <h2 className="text-[32px] leading-[normal] font-bold">{title}</h2>
          {subtitle && (
            <p className="text-[15px] leading-normal text-muted-foreground">{subtitle}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
