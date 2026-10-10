import Link from 'next/link';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'login', href: '/login', label: 'Iniciar sesión' },
  { key: 'signup', href: '/registro', label: 'Crear cuenta' },
] as const;

export function AuthTabs({ active }: { active: (typeof TABS)[number]['key'] }) {
  return (
    <nav
      aria-label="Acceso"
      className="relative grid auto-cols-fr grid-flow-col rounded-[15px] bg-muted p-1"
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-1 left-1 w-[calc((100%-8px)/2)] rounded-[11px] bg-card shadow-tab',
          'transition-transform duration-450 ease-[var(--ease-spring)] motion-reduce:transition-none',
          active === 'login' ? 'translate-x-0' : 'translate-x-full',
        )}
      />
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? 'page' : undefined}
          className={cn(
            'relative z-10 inline-flex h-9.5 items-center justify-center rounded-[11px] px-3.5 text-sm font-semibold whitespace-nowrap transition-colors duration-200',
            'outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
            tab.key === active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
