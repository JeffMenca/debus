'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth/session-client';

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      onClick={async () => {
        await signOut();
        router.replace('/login');
      }}
    >
      Cerrar sesión
    </Button>
  );
}
