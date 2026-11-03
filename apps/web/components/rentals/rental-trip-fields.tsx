'use client';

import { MapPin, Route, Users } from 'lucide-react';
import { DateField } from '@/components/forms/date-field';
import { TimeField } from '@/components/trips/time-field';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { inputRules } from '@/lib/forms/input-rules';
import type { RentalDraft, RentalProblems } from '@/lib/rentals/rental-form';

interface RentalTripFieldsProps {
  idPrefix: string;
  draft: RentalDraft;
  onChange: (patch: Partial<RentalDraft>) => void;
  problems: RentalProblems;
  today: string;
  // When given, the places are chosen from these departments instead of written.
  departments?: readonly string[];
}

interface PlaceFieldProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  departments?: readonly string[];
}

function PlaceField({
  id,
  label,
  placeholder,
  value,
  onChange,
  error,
  departments,
}: PlaceFieldProps) {
  return (
    <Field id={id} label={label} error={error}>
      {departments ? (
        <Select value={value} onValueChange={onChange} disabled={departments.length === 0}>
          <SelectTrigger id={id} {...invalidProps(id, error)}>
            <SelectValue placeholder="Elige el departamento" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={id}
          icon={MapPin}
          rule={inputRules.text(120)}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...invalidProps(id, error)}
        />
      )}
    </Field>
  );
}

// Where, when and how many: the trip a client asks for, online or at the counter.
export function RentalTripFields({
  idPrefix,
  draft,
  onChange,
  problems,
  today,
  departments,
}: RentalTripFieldsProps) {
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PlaceField
          id={id('origin')}
          label="Salen de"
          placeholder="Quetzaltenango"
          value={draft.origin}
          onChange={(origin) => onChange({ origin })}
          error={problems.origin}
          departments={departments}
        />
        <PlaceField
          id={id('destination')}
          label="Van a"
          placeholder="Panajachel"
          value={draft.destination}
          onChange={(destination) => onChange({ destination })}
          error={problems.destination}
          departments={departments}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <DateField
          id={id('departure-day')}
          label="Día de salida"
          value={draft.departureDay}
          min={today}
          onChange={(departureDay) => onChange({ departureDay })}
          error={problems.departure}
        />
        <TimeField
          id={id('departure-time')}
          label="Hora de salida"
          value={draft.departureTime}
          onChange={(departureTime) => onChange({ departureTime })}
        />
      </div>
      <div className="flex items-center gap-3">
        <Checkbox
          id={id('round-trip')}
          checked={draft.roundTrip}
          onCheckedChange={(value) => onChange({ roundTrip: value === true })}
        />
        <Label htmlFor={id('round-trip')} className="text-sm">
          Es ida y vuelta: el bus los espera y los trae de regreso
        </Label>
      </div>
      {draft.roundTrip && (
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <DateField
            id={id('return-day')}
            label="Día de regreso"
            value={draft.returnDay}
            min={draft.departureDay}
            hint="El mismo día de salida por defecto"
            onChange={(returnDay) => onChange({ returnDay })}
            error={problems.return}
          />
          <TimeField
            id={id('return-time')}
            label="Hora de regreso"
            value={draft.returnTime}
            onChange={(returnTime) => onChange({ returnTime })}
          />
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <Field id={id('passengers')} label="Pasajeros" error={problems.passengers}>
          <Input
            id={id('passengers')}
            icon={Users}
            rule={inputRules.integer(3)}
            placeholder="35"
            value={draft.passengers}
            onChange={(event) => onChange({ passengers: event.target.value })}
            className="font-mono tabular-nums"
            {...invalidProps(id('passengers'), problems.passengers)}
          />
        </Field>
        <Field id={id('distance')} label="Distancia aproximada (km)" error={problems.distance}>
          <Input
            id={id('distance')}
            icon={Route}
            rule={inputRules.decimal(4, 1)}
            placeholder="92"
            value={draft.distance}
            onChange={(event) => onChange({ distance: event.target.value })}
            className="font-mono tabular-nums"
            {...invalidProps(id('distance'), problems.distance)}
          />
        </Field>
      </div>
      <p className="text-[13px] text-muted-foreground">
        {departments
          ? 'Si no conoces la distancia, escribe un aproximado.'
          : 'Si no sabes la distancia, pon un aproximado. La sucursal la revisa contigo.'}
      </p>
    </div>
  );
}
