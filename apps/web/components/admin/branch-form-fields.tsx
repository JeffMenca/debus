'use client';

import {
  GUATEMALA_DEPARTMENTS,
  type BranchFields,
  BRANCH_NAME_MAX,
  BRANCH_MUNICIPALITY_MAX,
} from '@debus/contracts';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { inputRules } from '@/lib/forms/input-rules';
import { BranchLocationPicker, type PickedLocation } from './branch-location-picker';

export type BranchFieldName = keyof BranchFields;

export const BRANCH_FIELD_MESSAGES: Record<BranchFieldName, string> = {
  name: 'Escribe el nombre de la sucursal.',
  code: 'Usa de 3 a 5 letras.',
  department: 'Elige el departamento.',
  municipality: 'Escribe el municipio.',
  address: 'Escribe la dirección.',
  phone: 'Escribe un teléfono de 8 dígitos.',
  latitude: 'Marca la ubicación en el mapa.',
  longitude: 'Marca la ubicación en el mapa.',
};

interface BranchFormFieldsProps {
  field: (name: BranchFieldName) => UseFormRegisterReturn;
  errors: Partial<Record<BranchFieldName, string>>;
  department: string | undefined;
  onDepartmentChange: (department: string) => void;
  latitude: number;
  longitude: number;
  onLocationChange: (location: PickedLocation) => void;
}

const card = 'flex flex-col gap-4 rounded-[26px] bg-card p-6';

// The two cards every branch form shares; the first administrator belongs only to creating.
export function BranchFormFields({
  field,
  errors,
  department,
  onDepartmentChange,
  latitude,
  longitude,
  onLocationChange,
}: BranchFormFieldsProps) {
  const text = (name: BranchFieldName, props: { id: string; className?: string }) => ({
    ...props,
    ...invalidProps(props.id, errors[name]),
    ...field(name),
  });
  const hasPin = Number.isFinite(latitude) && Number.isFinite(longitude);

  return (
    <>
      <section aria-labelledby="branch-data" className={card}>
        <h2 id="branch-data" className="font-display text-xl font-bold">
          Datos de la sucursal
        </h2>
        <Field id="branch-name" label="Nombre" error={errors.name}>
          <Input
            {...text('name', { id: 'branch-name' })}
            rule={inputRules.text(BRANCH_NAME_MAX)}
            autoComplete="off"
          />
        </Field>
        <Field id="branch-code" label="Código" error={errors.code}>
          <Input
            {...text('code', { id: 'branch-code', className: 'font-mono uppercase' })}
            rule={inputRules.branchCode}
            autoComplete="off"
          />
          <span className="text-xs text-muted-foreground">De 3 a 5 letras, por ejemplo XEL</span>
        </Field>
        <Field id="branch-department" label="Departamento" error={errors.department}>
          <Select value={department ?? ''} onValueChange={onDepartmentChange}>
            <SelectTrigger
              id="branch-department"
              aria-invalid={errors.department ? true : undefined}
            >
              <SelectValue placeholder="Elige el departamento" />
            </SelectTrigger>
            <SelectContent>
              {GUATEMALA_DEPARTMENTS.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="branch-municipality" label="Municipio" error={errors.municipality}>
          <Input
            {...text('municipality', { id: 'branch-municipality' })}
            rule={inputRules.text(BRANCH_MUNICIPALITY_MAX)}
            autoComplete="off"
          />
        </Field>
        <Field id="branch-address" label="Dirección" error={errors.address}>
          <Input
            {...text('address', { id: 'branch-address' })}
            rule={inputRules.address}
            autoComplete="off"
          />
        </Field>
        <Field id="branch-phone" label="Teléfono" error={errors.phone}>
          <Input
            {...text('phone', { id: 'branch-phone', className: 'font-mono tabular-nums' })}
            rule={inputRules.phone}
            autoComplete="off"
          />
        </Field>
      </section>

      <section aria-labelledby="branch-location" className={card}>
        <h2 id="branch-location" className="font-display text-xl font-bold">
          Ubicación
        </h2>
        <BranchLocationPicker
          value={hasPin ? { latitude, longitude } : null}
          onChange={onLocationChange}
          error={errors.latitude ?? errors.longitude}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field id="branch-latitude" label="Latitud">
            <Input
              {...text('latitude', { id: 'branch-latitude', className: 'font-mono tabular-nums' })}
              rule={inputRules.coordinate}
              autoComplete="off"
            />
          </Field>
          <Field id="branch-longitude" label="Longitud">
            <Input
              {...text('longitude', {
                id: 'branch-longitude',
                className: 'font-mono tabular-nums',
              })}
              rule={inputRules.coordinate}
              autoComplete="off"
            />
          </Field>
        </div>
      </section>
    </>
  );
}
