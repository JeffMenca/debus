import type { AccountLinkPurpose } from '@debus/contracts';
import { Mail } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AuthCard } from './auth-card';

interface CheckEmailProps {
  kind: 'signup' | 'forgot' | 'renew';
  email?: string;
  // Only needed when renewing, to say how long the new link lasts.
  purpose?: AccountLinkPurpose;
}

function subtitleFor({ kind, email, purpose }: CheckEmailProps): string {
  if (kind === 'signup') {
    return `Te enviamos un enlace a ${email} para crear tu contraseña. Vence en 48 horas.`;
  }
  if (kind === 'forgot') {
    return 'Si hay una cuenta con ese correo, te llegará un enlace. Vence en 1 hora.';
  }
  const lifetime = purpose === 'ACTIVATION' ? '48 horas' : '1 hora';
  return `Te enviamos un enlace nuevo a tu correo. Vence en ${lifetime}.`;
}

export function CheckEmail(props: CheckEmailProps) {
  return (
    <AuthCard title="Revisa tu correo" subtitle={subtitleFor(props)}>
      <div className="flex size-14 items-center justify-center rounded-2xl bg-mint-100 text-mint-700">
        <Mail aria-hidden strokeWidth={1.75} className="size-6" />
      </div>
      <p className="text-sm leading-normal text-muted-foreground">
        ¿No llegó? Revisa tu carpeta de spam o vuelve a intentarlo en unos minutos.
      </p>
      <Button asChild variant="ghost">
        <Link href="/login">Volver a iniciar sesión</Link>
      </Button>
    </AuthCard>
  );
}
