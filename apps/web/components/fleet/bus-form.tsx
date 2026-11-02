'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type Bus,
  type BusFields,
  busFieldsSchema,
  FLEET_NAME_MAX,
  SEARCH_MAX_LENGTH,
} from '@debus/contracts';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FormAlert } from '@/components/auth/form-alert';
import { Bus as BusIllustration } from '@/components/brand/bus';
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
import { BUSES_PATH, useSaveBus, useUploadBusPhoto } from '@/hooks/use-buses';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDriverOptions } from '@/hooks/use-drivers';
import { photoPathOf } from '@/hooks/use-photo';
import { messageOf } from '@/lib/api/client';
import { busToFields } from '@/lib/fleet/bus-fields';
import { formatPlate } from '@/lib/format';
import { inputRules } from '@/lib/forms/input-rules';
import { PhotoField } from './photo-field';

type FormInput = z.input<typeof busFieldsSchema>;
type FieldName = keyof BusFields;

const NO_DRIVER = 'none';

const FIELD_MESSAGES: Record<
  Exclude<FieldName, 'operationalStatus' | 'assignedDriverId'>,
  string
> = {
  plate: 'Escribe la placa, por ejemplo C-482BTX.',
  brand: 'Escribe la marca.',
  model: 'Escribe el modelo.',
  year: `Escribe un año entre 1980 y ${new Date().getFullYear() + 1}.`,
  capacity: 'La capacidad va de 10 a 80 asientos.',
  mileageKm: 'Escribe el kilometraje, de 0 en adelante.',
};

const INTEGER_DIGITS = { year: 4, capacity: 2, mileageKm: 7 } as const;

type ServerClash = { field: 'plate' | 'driver' | null; message: string };

// The service answers a 409 with a sentence about what clashed, and the message goes next to it.
function clashOf(message: string): ServerClash {
  if (/placa/i.test(message)) return { field: 'plate', message };
  if (/chofer/i.test(message)) return { field: 'driver', message };
  return { field: null, message };
}

interface BusFormProps {
  // Editing when given, registering otherwise.
  bus?: Bus;
  onDone: () => void;
}

export function BusForm({ bus, onDone }: BusFormProps) {
  const save = useSaveBus();
  const uploadPhoto = useUploadBusPhoto();
  const [photo, setPhoto] = useState<File | null>(null);
  const [clash, setClash] = useState<ServerClash | null>(null);
  const [driverSearch, setDriverSearch] = useState('');
  const drivers = useDriverOptions(useDebouncedValue(driverSearch.trim()) || undefined).data;
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setFocus,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<FormInput, unknown, BusFields>({
    mode: 'onTouched',
    resolver: zodResolver(busFieldsSchema),
    defaultValues: bus
      ? { ...busToFields(bus), plate: formatPlate(bus.plate) }
      : { operationalStatus: 'AVAILABLE', assignedDriverId: null },
  });
  const status = useWatch({ control, name: 'operationalStatus' });
  const driverId = useWatch({ control, name: 'assignedDriverId' });

  const onSubmit = handleSubmit(async (fields) => {
    setClash(null);
    let saved: Bus;
    try {
      saved = await save.mutateAsync({ id: bus?.id, fields });
    } catch (error) {
      const clashing = clashOf(messageOf(error));
      setClash(clashing);
      if (clashing.field === 'plate') setFocus('plate');
      if (clashing.field === 'driver') {
        // A select is not a registered field, so its trigger is focused directly.
        document.getElementById('bus-driver')?.focus();
      }
      return;
    }
    const plate = formatPlate(saved.plate);
    if (photo) {
      try {
        await uploadPhoto.mutateAsync({ id: saved.id, file: photo });
      } catch {
        toast.error('Guardamos el bus, pero no la foto. Intenta subirla de nuevo.');
        onDone();
        return;
      }
    }
    toast.success(bus ? `Guardamos los cambios del bus ${plate}.` : `Registramos el bus ${plate}.`);
    onDone();
  });

  function error(name: keyof typeof FIELD_MESSAGES): string | undefined {
    if (errors[name]) return FIELD_MESSAGES[name];
    if (clash?.field === name) return clash.message;
    return undefined;
  }
  const driverError = clash?.field === 'driver' ? clash.message : undefined;

  const options = drivers?.items ?? [];
  // The driver who has the bus now stays on the list even if the search leaves them out.
  const current =
    bus?.assignedDriverId && !options.some((driver) => driver.id === bus.assignedDriverId)
      ? {
          id: bus.assignedDriverId,
          fullName: bus.assignedDriverName ?? 'Chofer asignado',
          assignedBusPlate: bus.plate,
        }
      : null;
  const showDriverSearch =
    Boolean(driverSearch) || (drivers ? drivers.total > options.length : false);
  const text = (name: keyof typeof FIELD_MESSAGES, id: string) => ({
    id,
    autoComplete: 'off',
    ...invalidProps(id, error(name)),
  });
  const submitLabel = bus ? 'Guardar cambios' : 'Registrar bus';
  const number = (name: keyof typeof INTEGER_DIGITS) => ({
    rule: inputRules.integer(INTEGER_DIGITS[name]),
    className: 'font-mono tabular-nums',
    ...register(name, { valueAsNumber: true }),
  });

  return (
    <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4">
        {clash && !clash.field && <FormAlert tone="error">{clash.message}</FormAlert>}
        <PhotoField
          id="bus-photo"
          label="Foto del bus"
          value={photo}
          onChange={setPhoto}
          currentPath={bus?.hasPhoto ? photoPathOf(BUSES_PATH, bus.id) : null}
          fallback={<BusIllustration width={64} tone="indigo" moving={false} />}
        />
        <Field id="bus-plate" label="Placa" error={error('plate')}>
          <Input
            {...text('plate', 'bus-plate')}
            rule={inputRules.plate}
            placeholder="C482BTX"
            className="font-mono uppercase"
            {...register('plate')}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="bus-brand" label="Marca" error={error('brand')}>
            <Input
              {...text('brand', 'bus-brand')}
              rule={inputRules.text(FLEET_NAME_MAX)}
              {...register('brand')}
            />
          </Field>
          <Field id="bus-model" label="Modelo" error={error('model')}>
            <Input
              {...text('model', 'bus-model')}
              rule={inputRules.text(FLEET_NAME_MAX)}
              {...register('model')}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="bus-year" label="Año" error={error('year')}>
            <Input {...text('year', 'bus-year')} {...number('year')} />
          </Field>
          <Field id="bus-capacity" label="Capacidad" error={error('capacity')}>
            <Input {...text('capacity', 'bus-capacity')} {...number('capacity')} />
            <span className="text-xs text-muted-foreground">Asientos</span>
          </Field>
        </div>
        <Field id="bus-mileage" label="Kilometraje" error={error('mileageKm')}>
          <Input {...text('mileageKm', 'bus-mileage')} {...number('mileageKm')} />
          <span className="text-xs text-muted-foreground">Kilómetros recorridos hasta hoy</span>
        </Field>
        <Field id="bus-status" label="Estado">
          <Select
            value={status}
            onValueChange={(value) =>
              setValue('operationalStatus', value as BusFields['operationalStatus'])
            }
          >
            <SelectTrigger id="bus-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AVAILABLE">Disponible</SelectItem>
              <SelectItem value="IN_WORKSHOP">En taller</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field id="bus-driver" label="Chofer de planta" error={driverError}>
          {showDriverSearch && (
            <Input
              type="search"
              rule={inputRules.text(SEARCH_MAX_LENGTH)}
              aria-label="Buscar chofer"
              placeholder="Buscar chofer por nombre, licencia o correo"
              value={driverSearch}
              onChange={(event) => setDriverSearch(event.target.value)}
            />
          )}
          <Select
            value={driverId ?? NO_DRIVER}
            onValueChange={(value) =>
              setValue('assignedDriverId', value === NO_DRIVER ? null : value, {
                shouldValidate: isSubmitted,
              })
            }
          >
            <SelectTrigger id="bus-driver" {...invalidProps('bus-driver', driverError)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_DRIVER}>Sin asignar</SelectItem>
              {[...(current ? [current] : []), ...options].map((driver) => {
                // The service refuses a driver who has another bus, so the list does not offer them.
                const otherPlate =
                  driver.assignedBusPlate && driver.assignedBusPlate !== bus?.plate
                    ? driver.assignedBusPlate
                    : null;
                return (
                  <SelectItem key={driver.id} value={driver.id} disabled={Boolean(otherPlate)}>
                    {otherPlate
                      ? `${driver.fullName} (en el bus ${formatPlate(otherPlate)})`
                      : driver.fullName}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
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
