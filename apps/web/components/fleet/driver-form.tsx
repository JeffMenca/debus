'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type Driver,
  type DriverFields,
  LICENSE_TYPES,
  driverFieldsSchema,
  todayInGuatemala,
} from '@debus/contracts';
import { UserRound } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FormAlert } from '@/components/auth/form-alert';
import { DateField } from '@/components/forms/date-field';
import { Button } from '@/components/ui/button';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DRIVERS_PATH, useSaveDriver, useUploadDriverPhoto } from '@/hooks/use-drivers';
import { photoPathOf } from '@/hooks/use-photo';
import { messageOf } from '@/lib/api/client';
import { formatPhone } from '@/lib/format';
import { PhotoField } from './photo-field';

type FormInput = z.input<typeof driverFieldsSchema>;
type FieldName = keyof DriverFields;

const FIELD_MESSAGES: Record<FieldName, string> = {
  fullName: 'Escribe su nombre completo.',
  email: 'Escribe un correo válido.',
  phone: 'Escribe un teléfono de 8 dígitos.',
  licenseNumber: 'Escribe el número de licencia, de 5 a 20 letras y números.',
  licenseType: 'Elige el tipo de licencia.',
  licenseExpiresOn: 'Elige la fecha en que vence la licencia.',
  baseSalary: 'Escribe el salario en quetzales, con hasta dos decimales.',
};

type ServerClash = { field: 'licenseNumber' | 'email' | null; message: string };

// The service answers a 409 with a sentence about what clashed, and the message goes next to it.
function clashOf(message: string): ServerClash {
  if (/licencia/i.test(message)) return { field: 'licenseNumber', message };
  if (/correo/i.test(message)) return { field: 'email', message };
  return { field: null, message };
}

interface DriverFormProps {
  // Editing when given, registering otherwise.
  driver?: Driver;
  onDone: () => void;
}

export function DriverForm({ driver, onDone }: DriverFormProps) {
  const save = useSaveDriver();
  const uploadPhoto = useUploadDriverPhoto();
  const [photo, setPhoto] = useState<File | null>(null);
  const [clash, setClash] = useState<ServerClash | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setFocus,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<FormInput, unknown, DriverFields>({
    resolver: zodResolver(driverFieldsSchema),
    defaultValues: driver
      ? {
          fullName: driver.fullName,
          email: driver.email,
          phone: formatPhone(driver.phone),
          licenseNumber: driver.licenseNumber,
          licenseType: driver.licenseType,
          licenseExpiresOn: driver.licenseExpiresOn,
          baseSalary: driver.baseSalary,
        }
      : { licenseExpiresOn: todayInGuatemala() },
  });
  const licenseType = useWatch({ control, name: 'licenseType' });
  const expiresOn = useWatch({ control, name: 'licenseExpiresOn' });

  const onSubmit = handleSubmit(async (fields) => {
    setClash(null);
    let saved: Driver;
    try {
      saved = await save.mutateAsync({ id: driver?.id, fields });
    } catch (error) {
      const clashing = clashOf(messageOf(error));
      setClash(clashing);
      if (clashing.field) setFocus(clashing.field);
      return;
    }
    if (photo) {
      try {
        await uploadPhoto.mutateAsync({ id: saved.id, file: photo });
      } catch {
        toast.error('Guardamos al chofer, pero no la foto. Intenta subirla de nuevo.');
        onDone();
        return;
      }
    }
    toast.success(
      driver
        ? `Guardamos los cambios de ${saved.fullName}.`
        : `Registramos a ${saved.fullName}. Le enviamos un correo para crear su contraseña.`,
    );
    onDone();
  });

  function error(name: FieldName): string | undefined {
    if (errors[name]) return FIELD_MESSAGES[name];
    if (clash?.field === name) return clash.message;
    return undefined;
  }
  const text = (name: FieldName, id: string) => ({
    id,
    autoComplete: 'off',
    ...invalidProps(id, error(name)),
    ...register(name),
  });
  const submitLabel = driver ? 'Guardar cambios' : 'Registrar chofer';

  return (
    <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4">
        {clash && !clash.field && <FormAlert tone="error">{clash.message}</FormAlert>}
        <PhotoField
          id="driver-photo"
          label="Foto del chofer"
          value={photo}
          onChange={setPhoto}
          currentPath={driver?.hasPhoto ? photoPathOf(DRIVERS_PATH, driver.id) : null}
          fallback={
            <UserRound aria-hidden strokeWidth={1.75} className="size-8 text-muted-foreground" />
          }
        />
        <Field id="driver-name" label="Nombre completo" error={error('fullName')}>
          <Input {...text('fullName', 'driver-name')} />
        </Field>
        <Field id="driver-email" label="Correo" error={error('email')}>
          <Input {...text('email', 'driver-email')} type="email" placeholder="chofer@correo.com" />
          <span className="text-xs text-muted-foreground">
            Con este correo entrará a debus para registrar sus salidas. Debe ser solo suyo.
          </span>
        </Field>
        <Field id="driver-phone" label="Teléfono" error={error('phone')}>
          <Input
            {...text('phone', 'driver-phone')}
            inputMode="tel"
            className="font-mono tabular-nums"
          />
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field id="driver-license" label="Número de licencia" error={error('licenseNumber')}>
            <Input {...text('licenseNumber', 'driver-license')} className="font-mono uppercase" />
          </Field>
          <Field id="driver-license-type" label="Tipo de licencia" error={error('licenseType')}>
            <Select
              value={licenseType ?? ''}
              onValueChange={(value) =>
                setValue('licenseType', value as DriverFields['licenseType'], {
                  shouldValidate: isSubmitted,
                })
              }
            >
              <SelectTrigger
                id="driver-license-type"
                className="min-w-32"
                aria-invalid={errors.licenseType ? true : undefined}
              >
                <SelectValue placeholder="Elige" />
              </SelectTrigger>
              <SelectContent>
                {LICENSE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {`Tipo ${type}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DateField
          id="driver-license-expires"
          label="Vencimiento de la licencia"
          value={expiresOn ?? ''}
          onChange={(value) => setValue('licenseExpiresOn', value, { shouldValidate: isSubmitted })}
          error={errors.licenseExpiresOn ? FIELD_MESSAGES.licenseExpiresOn : undefined}
        />
        <Field id="driver-salary" label="Salario base por viaje (Q)" error={error('baseSalary')}>
          <Input
            id="driver-salary"
            type="number"
            step="0.01"
            inputMode="decimal"
            autoComplete="off"
            className="font-mono tabular-nums"
            {...invalidProps('driver-salary', error('baseSalary'))}
            {...register('baseSalary', { valueAsNumber: true })}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 p-5 pt-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
