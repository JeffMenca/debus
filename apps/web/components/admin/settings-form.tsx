'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createSettingsRequestSchema, todayInGuatemala } from '@debus/contracts';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FormAlert } from '@/components/auth/form-alert';
import { DateField } from '@/components/forms/date-field';
import { Button } from '@/components/ui/button';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useCreateSettings } from '@/hooks/use-settings';
import { messageOf } from '@/lib/api/client';
import { formatLongDate } from '@/lib/format';

// "Today" is read when the form is checked, so a page left open overnight still validates.
const formSchema = createSettingsRequestSchema.refine(
  (value) => value.effectiveFrom >= todayInGuatemala(),
  { path: ['effectiveFrom'], message: 'past' },
);
type FormInput = z.input<typeof formSchema>;

type AmountName = 'depreciationPerKm' | 'rentalRatePerKm';

const TWO_DECIMALS = 'at most two decimals';

export function SettingsForm() {
  const create = useCreateSettings();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: { effectiveFrom: todayInGuatemala() },
  });
  const effectiveFrom = useWatch({ control, name: 'effectiveFrom' });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await create.mutateAsync(values);
      toast.success(
        `Guardamos la configuración. Rige desde el ${formatLongDate(values.effectiveFrom)}.`,
      );
      // Without arguments it also clears the inputs the person typed in, back to the defaults.
      reset();
    } catch (error) {
      setServerError(messageOf(error));
    }
  });
  function amountError(name: AmountName): string | undefined {
    const error = errors[name];
    if (!error) return undefined;
    return error.message === TWO_DECIMALS
      ? 'Usa como máximo dos decimales.'
      : 'Escribe un monto mayor que cero.';
  }
  const amount = (name: AmountName, id: string) => ({
    id,
    inputMode: 'decimal' as const,
    autoComplete: 'off',
    className: 'font-mono tabular-nums',
    ...invalidProps(id, amountError(name)),
    ...register(name, { valueAsNumber: true }),
  });

  return (
    <section
      aria-labelledby="settings-form"
      className="flex flex-col gap-4 rounded-[26px] bg-card p-6"
    >
      <h2 id="settings-form" className="font-display text-xl font-bold">
        Programar un cambio
      </h2>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {serverError && <FormAlert tone="error">{serverError}</FormAlert>}
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            id="settings-depreciation"
            label="Depreciación por kilómetro (Q)"
            error={amountError('depreciationPerKm')}
          >
            <Input {...amount('depreciationPerKm', 'settings-depreciation')} />
          </Field>
          <Field
            id="settings-rental"
            label="Tarifa de alquiler por kilómetro (Q)"
            error={amountError('rentalRatePerKm')}
          >
            <Input {...amount('rentalRatePerKm', 'settings-rental')} />
          </Field>
        </div>
        <div className="max-w-xs">
          <DateField
            id="settings-from"
            label="Vigente desde"
            value={effectiveFrom ?? ''}
            min={todayInGuatemala()}
            onChange={(value) => setValue('effectiveFrom', value, { shouldValidate: isSubmitted })}
            error={errors.effectiveFrom ? 'Elige hoy o una fecha posterior.' : undefined}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Los viajes ya registrados conservan el monto con el que se calcularon.
        </p>
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Guardar cambio'}
          </Button>
        </div>
      </form>
    </section>
  );
}
