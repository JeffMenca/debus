import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FormAlertProps {
  tone: 'error' | 'success';
  icon?: LucideIcon;
  // Announce the message to screen readers; turn off for notes that are always there.
  live?: boolean;
  children: ReactNode;
}

export function FormAlert({ tone, icon: Icon, live = true, children }: FormAlertProps) {
  const liveRole = tone === 'error' ? 'alert' : 'status';
  return (
    <div
      role={live ? liveRole : undefined}
      className={cn(
        'flex items-start gap-3 rounded-2xl px-4 py-3.5 text-sm leading-normal',
        tone === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-mint-100 text-mint-700',
      )}
    >
      {Icon && <Icon aria-hidden strokeWidth={1.75} className="mt-px size-5 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}
