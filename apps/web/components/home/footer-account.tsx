'use client';

import { TextLink } from '@/components/ui/text-link';
import { useAudience } from '@/hooks/use-audience';
import { homePathFor } from '@/lib/auth/home-path';

const VISITOR_LINKS = [
  { href: '/login', label: 'Iniciar sesión' },
  { href: '/registro', label: 'Crear cuenta' },
  { href: '/recuperar', label: '¿Olvidaste tu contraseña?' },
] as const;

// While the session is checked the column keeps the room a visitor's links will take.
function Checking() {
  return (
    <div
      aria-hidden="true"
      data-testid="footer-account-checking"
      className="flex flex-col gap-3 pt-0.5"
    >
      {['w-16', 'w-24', 'w-20', 'w-40'].map((width) => (
        <div key={width} className={`h-4 rounded-sm bg-sidebar-accent ${width}`} />
      ))}
    </div>
  );
}

export function FooterAccount() {
  const audience = useAudience();

  if (audience === 'checking') return <Checking />;
  // A client is already greeted in the header, and has no panel of their own.
  if (audience === 'CLIENT') return null;

  const links =
    audience === 'visitor'
      ? VISITOR_LINKS
      : ([{ href: homePathFor(audience), label: 'Ir a mi panel' }] as const);

  return (
    <nav aria-label="Enlaces del pie" className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold tracking-[0.07em] text-sidebar-foreground/70 uppercase">
        Tu cuenta
      </h2>
      {links.map(({ href, label }) => (
        <TextLink key={href} href={href} tone="light" size="md">
          {label}
        </TextLink>
      ))}
    </nav>
  );
}
