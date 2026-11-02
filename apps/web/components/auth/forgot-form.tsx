'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { emailRequestSchema } from '@debus/contracts';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { TextLink } from '@/components/ui/text-link';
import { useHydrated } from '@/hooks/use-hydrated';
import { messageOf } from '@/lib/api/api-error';
import { forgotPassword } from '@/lib/auth/auth-api';
import { FIELD_MESSAGES } from '@/lib/auth/form-messages';
import { inputRules } from '@/lib/forms/input-rules';
import { AuthCard } from './auth-card';
import { CheckEmail } from './check-email';
import { FormAlert } from './form-alert';

type ForgotInput = z.input<typeof emailRequestSchema>;
type ForgotValues = z.output<typeof emailRequestSchema>;

export function ForgotForm() {
  const hydrated = useHydrated();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotInput, unknown, ForgotValues>({ resolver: zodResolver(emailRequestSchema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setServerError(null);
    try {
      await forgotPassword(email);
      setSentTo(email);
    } catch (error) {
      setServerError(messageOf(error));
    }
  });

  if (sentTo) return <CheckEmail kind="forgot" email={sentTo} />;

  const emailError = errors.email && FIELD_MESSAGES.email;
  return (
    <AuthCard
      title="¿Olvidaste tu contraseña?"
      subtitle="Escribe tu correo y te enviamos un enlace para elegir una nueva."
    >
      <form method="post" noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field id="forgot-email" label="Correo electrónico" error={emailError}>
          <Input
            id="forgot-email"
            type="email"
            rule={inputRules.email}
            icon={Mail}
            autoComplete="email"
            placeholder="tu@correo.com"
            {...invalidProps('forgot-email', emailError)}
            {...register('email')}
          />
        </Field>
        {serverError && <FormAlert tone="error">{serverError}</FormAlert>}
        <Button type="submit" size="lg" arrow={!isSubmitting} disabled={!hydrated || isSubmitting}>
          {isSubmitting ? 'Enviando...' : 'Enviar enlace'}
        </Button>
      </form>
      <TextLink href="/login" className="self-center text-sm">
        Volver a iniciar sesión
      </TextLink>
    </AuthCard>
  );
}
