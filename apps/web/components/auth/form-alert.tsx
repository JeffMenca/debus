import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONE_CLASSES = {
  error: 'bg-rose-100 text-rose-700',
  success: 'bg-mint-100 text-mint-700',
  info: 'bg-sky-100 text-sky-700',
} as const;

interface FormAlertProps {
  tone: 'error' | 'success' | 'info';
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
        TONE_CLASSES[tone],
      )}
    >
      {Icon && <Icon aria-hidden strokeWidth={1.75} className="mt-px size-5 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}
