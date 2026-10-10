'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema } from '@debus/contracts';
import { CircleCheck, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TextLink } from '@/components/ui/text-link';
import { messageOf } from '@/lib/api/api-error';
import { homePathFor, safeNext } from '@/lib/auth/home-path';
import { FIELD_MESSAGES } from '@/lib/auth/form-messages';
import { signIn } from '@/lib/auth/session-client';
import { AuthCard } from './auth-card';
import { AuthTabs } from './auth-tabs';
import { Field, invalidProps } from './field';
import { FormAlert } from './form-alert';
import { PasswordInput } from './password-input';

const PASSWORD_REQUIRED = 'Escribe tu contraseña.';

type LoginInput = z.input<typeof loginRequestSchema>;
type LoginValues = z.output<typeof loginRequestSchema>;

interface LoginFormProps {
  next: string | null;
  notice?: 'passwordSet';
}

export function LoginForm({ next, notice }: LoginFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput, unknown, LoginValues>({ resolver: zodResolver(loginRequestSchema) });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setPending(true);
    setServerError(null);
    try {
      const session = await signIn(email, password);
      // Stay disabled after success: the page is about to change.
      router.replace(safeNext(next) ?? homePathFor(session.user.role));
    } catch (error) {
      setServerError(messageOf(error));
      setPending(false);
    }
  });

  const emailError = errors.email && FIELD_MESSAGES.email;
  const passwordError = errors.password && PASSWORD_REQUIRED;

  return (
    <AuthCard title="Hola de nuevo" subtitle="Ingresa para ver tus viajes y tu saldo.">
      <AuthTabs active="login" />
      <form
        noValidate
        onSubmit={onSubmit}
        className="flex animate-[arrive_0.45s_var(--ease-route)_both] flex-col gap-4 motion-reduce:animate-none"
      >
        {notice === 'passwordSet' && (
          <FormAlert tone="success" icon={CircleCheck}>
            Tu contraseña quedó lista. Ya puedes ingresar.
          </FormAlert>
        )}
        <Field id="login-email" label="Correo electrónico" error={emailError}>
          <Input
            id="login-email"
            type="email"
            icon={Mail}
            autoComplete="email"
            placeholder="tu@correo.com"
            {...invalidProps('login-email', emailError)}
            {...register('email')}
          />
        </Field>
        <Field
          id="login-password"
          label="Contraseña"
          error={passwordError}
          aside={
            <TextLink href="/recuperar" className="underline">
              ¿La olvidaste?
            </TextLink>
          }
        >
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            {...invalidProps('login-password', passwordError)}
            {...register('password')}
          />
        </Field>
        {serverError && <FormAlert tone="error">{serverError}</FormAlert>}
        <Button type="submit" size="lg" arrow={!pending} disabled={pending} className="mt-1.5">
          {pending ? 'Ingresando...' : 'Ingresar'}
        </Button>
      </form>
    </AuthCard>
  );
}
