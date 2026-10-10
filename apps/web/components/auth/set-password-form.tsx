'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type AccountLinkPurpose, passwordSchema } from '@debus/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { ApiError, messageOf } from '@/lib/api/api-error';
import { setPassword } from '@/lib/auth/auth-api';
import { FIELD_MESSAGES } from '@/lib/auth/form-messages';
import { AuthCard } from './auth-card';
import { Field, invalidProps } from './field';
import { FormAlert } from './form-alert';
import { PasswordInput } from './password-input';

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine(({ password, confirm }) => password === confirm, { path: ['confirm'] });
type Values = z.infer<typeof schema>;

const TEXTS: Record<AccountLinkPurpose, { title: string; subtitle: string }> = {
  ACTIVATION: {
    title: 'Crea tu contraseña',
    subtitle: 'Elige una contraseña que solo tú conozcas. Usa al menos 8 caracteres.',
  },
  PASSWORD_RESET: {
    title: 'Elige una nueva contraseña',
    subtitle: 'Al guardarla cerraremos tus otras sesiones.',
  },
};

// 409 and 410 mean the link stopped working while the person typed.
const LINK_GONE = [409, 410];

interface SetPasswordFormProps {
  token: string;
  purpose: AccountLinkPurpose;
  onLinkProblem?: () => void;
}

export function SetPasswordForm({ token, purpose, onLinkProblem }: SetPasswordFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    setPending(true);
    setServerError(null);
    try {
      await setPassword({ token, password });
      router.replace('/login?listo=1');
    } catch (error) {
      setPending(false);
      if (onLinkProblem && error instanceof ApiError && LINK_GONE.includes(error.status)) {
        onLinkProblem();
        return;
      }
      setServerError(messageOf(error));
    }
  });

  const passwordError = errors.password && FIELD_MESSAGES.password;
  const confirmError = errors.confirm && FIELD_MESSAGES.confirm;
  return (
    <AuthCard {...TEXTS[purpose]}>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field id="new-password" label="Contraseña" error={passwordError}>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            {...invalidProps('new-password', passwordError)}
            {...register('password')}
          />
        </Field>
        <Field id="confirm-password" label="Repite tu contraseña" error={confirmError}>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            {...invalidProps('confirm-password', confirmError)}
            {...register('confirm')}
          />
        </Field>
        {serverError && <FormAlert tone="error">{serverError}</FormAlert>}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Guardando...' : 'Guardar contraseña'}
        </Button>
      </form>
    </AuthCard>
  );
}
