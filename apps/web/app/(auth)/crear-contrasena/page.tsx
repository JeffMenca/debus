import type { Metadata } from 'next';
import { SetPasswordScreen } from '@/components/auth/set-password-screen';
import { firstParam } from '@/lib/auth/search-params';

export const metadata: Metadata = { title: 'Crea tu contraseña · debus' };

export default async function CreatePasswordPage({ searchParams }: PageProps<'/crear-contrasena'>) {
  const { token } = await searchParams;
  return <SetPasswordScreen token={firstParam(token)} purpose="ACTIVATION" />;
}
