import type { Metadata } from 'next';
import { SetPasswordScreen } from '@/components/auth/set-password-screen';
import { firstParam } from '@/lib/auth/search-params';

export const metadata: Metadata = { title: 'Nueva contraseña · debus' };

export default async function ResetPasswordPage({ searchParams }: PageProps<'/restablecer'>) {
  const { token } = await searchParams;
  return <SetPasswordScreen token={firstParam(token)} purpose="PASSWORD_RESET" />;
}
