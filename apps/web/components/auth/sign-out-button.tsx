'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth/session-client';

// `compact` is an icon-only button for tight places such as the sidebar footer.
export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size={compact ? 'icon' : 'default'}
      aria-label={compact ? 'Cerrar sesión' : undefined}
      className={compact ? 'h-9 w-9 text-sidebar-foreground hover:bg-sidebar-accent' : undefined}
      onClick={async () => {
        await signOut();
        router.replace('/login');
      }}
    >
      {compact ? <LogOut aria-hidden strokeWidth={1.75} className="size-4" /> : 'Cerrar sesión'}
    </Button>
  );
}
