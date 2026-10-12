'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from 'lucide-react';

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon aria-hidden strokeWidth={1.75} className="size-4" />,
        info: <InfoIcon aria-hidden strokeWidth={1.75} className="size-4" />,
        warning: <TriangleAlertIcon aria-hidden strokeWidth={1.75} className="size-4" />,
        error: <OctagonXIcon aria-hidden strokeWidth={1.75} className="size-4" />,
        loading: (
          <Loader2Icon
            aria-hidden
            strokeWidth={1.75}
            className="size-4 animate-spin motion-reduce:animate-none"
          />
        ),
      }}
      style={
        {
          '--normal-bg': 'var(--foreground)',
          '--normal-text': 'var(--background)',
          '--normal-border': 'transparent',
          '--border-radius': '1rem',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'rounded-2xl! shadow-float! font-sans! text-sm!',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
