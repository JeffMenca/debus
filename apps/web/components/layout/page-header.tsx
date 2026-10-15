import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, actions }: PageHeaderProps) {
  return (
    <header className="flex animate-arrive flex-wrap items-end justify-between gap-4 motion-reduce:animate-none">
      <div className="flex flex-col gap-1.5">
        {eyebrow && <span className="text-sm font-medium text-muted-foreground">{eyebrow}</span>}
        <h1 className="font-display text-[32px] leading-none font-bold md:text-[40px]">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </header>
  );
}
