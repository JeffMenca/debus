import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';
import { safeNext } from '@/lib/auth/home-path';
import { firstParam } from '@/lib/auth/search-params';

export const metadata: Metadata = { title: 'Ingresar · debus' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { siguiente, listo } = await searchParams;
  return (
    <LoginForm
      next={safeNext(firstParam(siguiente))}
      notice={firstParam(listo) === '1' ? 'listo' : undefined}
    />
  );
}
