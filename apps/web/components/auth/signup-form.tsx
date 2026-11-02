'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type SignupRequest, signupRequestSchema, FULL_NAME_MAX } from '@debus/contracts';
import { Ticket } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useHydrated } from '@/hooks/use-hydrated';
import { messageOf } from '@/lib/api/api-error';
import { type FieldName, FIELD_MESSAGES } from '@/lib/auth/form-messages';
import { signUp } from '@/lib/auth/auth-api';
import { inputRules } from '@/lib/forms/input-rules';
import { AuthCard } from './auth-card';
import { AuthTabs } from './auth-tabs';
import { CheckEmail } from './check-email';
import { FormAlert } from './form-alert';

type FormInput = z.input<typeof signupRequestSchema>;

export function SignupForm() {
  const hydrated = useHydrated();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, SignupRequest>({
    mode: 'onTouched',
    resolver: zodResolver(signupRequestSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await signUp(values);
      setSentTo(values.email);
    } catch (error) {
      setServerError(messageOf(error));
    }
  });

  if (sentTo) return <CheckEmail kind="signup" email={sentTo} />;

  const error = (name: Extract<FieldName, keyof FormInput>) =>
    errors[name] ? FIELD_MESSAGES[name] : undefined;
  const props = (name: Extract<FieldName, keyof FormInput>) => ({
    id: `signup-${name}`,
    ...invalidProps(`signup-${name}`, error(name)),
    ...register(name),
  });

  return (
    <AuthCard
      title="Crea tu cuenta"
      subtitle="Con tu cuenta compras en línea y alquilas buses para tu grupo."
    >
      <AuthTabs active="signup" />
      <form
        method="post"
        noValidate
        onSubmit={onSubmit}
        className="flex animate-[arrive_0.45s_var(--ease-route)_both] flex-col gap-3.5 motion-reduce:animate-none"
      >
        <Field id="signup-fullName" label="Nombre completo" error={error('fullName')}>
          <Input
            {...props('fullName')}
            rule={inputRules.text(FULL_NAME_MAX)}
            autoComplete="name"
            placeholder="Como aparece en tu DPI"
          />
        </Field>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))] gap-3.5">
          <Field id="signup-nit" label="NIT" optional error={error('nit')}>
            <Input
              {...props('nit')}
              rule={inputRules.nit}
              autoComplete="off"
              placeholder="0000000-0"
              className="font-mono tabular-nums"
            />
          </Field>
          <Field id="signup-dpi" label="DPI" error={error('dpi')}>
            <Input
              {...props('dpi')}
              rule={inputRules.dpi}
              autoComplete="off"
              placeholder="0000 00000 0000"
              className="font-mono tabular-nums"
            />
          </Field>
          <Field id="signup-phone" label="Teléfono" error={error('phone')}>
            <Input
              {...props('phone')}
              type="tel"
              rule={inputRules.phone}
              autoComplete="tel"
              placeholder="0000 0000"
              className="font-mono tabular-nums"
            />
          </Field>
          <Field id="signup-email" label="Correo" error={error('email')}>
            <Input
              {...props('email')}
              type="email"
              rule={inputRules.email}
              autoComplete="email"
              placeholder="tu@correo.com"
            />
          </Field>
        </div>
        <Field id="signup-address" label="Dirección" optional error={error('address')}>
          <Input
            {...props('address')}
            rule={inputRules.address}
            autoComplete="street-address"
            placeholder="Zona, municipio, departamento"
          />
        </Field>
        <FormAlert tone="success" icon={Ticket} live={false}>
          Si ya compraste en ventanilla con este NIT, esos boletos aparecerán en tu historial.
        </FormAlert>
        {serverError && <FormAlert tone="error">{serverError}</FormAlert>}
        <Button type="submit" size="lg" arrow={!isSubmitting} disabled={!hydrated || isSubmitting}>
          {isSubmitting ? 'Creando tu cuenta...' : 'Crear cuenta'}
        </Button>
      </form>
    </AuthCard>
  );
}
