'use client';

import { SEAT_SELECTION_MAX, type TripPlaces, todayInGuatemala } from '@debus/contracts';
import { ArrowLeftRight, MapPin, Search, Users } from 'lucide-react';
import { type FormEvent, useState } from 'react';
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
import { type TripSearch, readPassengerCount } from '@/lib/tickets/trip-search-params';

export type SearchPatch = Pick<TripSearch, 'origin' | 'destination' | 'date' | 'passengers'>;

interface TripSearchFormProps {
  search: TripSearch;
  places: TripPlaces | undefined;
  onSearch: (patch: SearchPatch) => void;
}

// Radix needs a value for "no choice"; it stands for anywhere.
const ANYWHERE = '__anywhere__';
const PASSENGERS_PROBLEM = `Escribe de 1 a ${SEAT_SELECTION_MAX} pasajeros.`;

interface PlaceSelectProps {
  id: string;
  label: string;
  anywhere: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function PlaceSelect({ id, label, anywhere, value, options, onChange }: PlaceSelectProps) {
  // A place from the address that has no trips any more still shows as chosen.
  const shown = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <Field id={id} label={label}>
      <Select
        value={value || ANYWHERE}
        // Radix reports '' when an option appears as its value is set, which is no choice at all.
        onValueChange={(next) => next && onChange(next === ANYWHERE ? '' : next)}
      >
        <SelectTrigger id={id} className="w-full">
          <span className="flex min-w-0 items-center gap-2.5">
            <MapPin aria-hidden strokeWidth={1.75} className="size-5 text-primary" />
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANYWHERE}>{anywhere}</SelectItem>
          {shown.map((place) => (
            <SelectItem key={place} value={place}>
              {place}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

// The search card under the hero. It keeps a draft: the address changes only on "Buscar viajes".
export function TripSearchForm({ search, places, onSearch }: TripSearchFormProps) {
  const today = todayInGuatemala();
  const [origin, setOrigin] = useState(search.origin ?? '');
  const [destination, setDestination] = useState(search.destination ?? '');
  const [date, setDate] = useState(search.date);
  const [passengers, setPassengers] = useState(String(search.passengers));
  const [problem, setProblem] = useState<string | undefined>();

  function swap() {
    setOrigin(destination);
    setDestination(origin);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const count = readPassengerCount(passengers);
    if (count === null) {
      setProblem(PASSENGERS_PROBLEM);
      return;
    }
    setProblem(undefined);
    onSearch({
      origin: origin || undefined,
      destination: destination || undefined,
      date,
      passengers: count,
    });
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-label="Buscar viajes"
      className="relative z-[3] -mt-14 mx-2 grid gap-3 rounded-[26px] bg-card p-4 shadow-float sm:mx-6 sm:p-5 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_auto] lg:items-end"
    >
      <PlaceSelect
        id="search-origin"
        label="Origen"
        anywhere="Cualquier origen"
        value={origin}
        options={places?.origins ?? []}
        onChange={setOrigin}
      />
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label="Invertir origen y destino"
        onClick={swap}
        className="justify-self-center md:col-span-2 md:justify-self-start lg:col-span-1"
      >
        <ArrowLeftRight aria-hidden strokeWidth={1.75} className="size-5" />
      </Button>
      <PlaceSelect
        id="search-destination"
        label="Destino"
        anywhere="Cualquier destino"
        value={destination}
        options={places?.destinations ?? []}
        onChange={setDestination}
      />
      <DateField
        id="search-date"
        label="Fecha de salida"
        value={date}
        hint="Hoy por defecto"
        onChange={(value) => setDate(value || today)}
      />
      <Field id="search-passengers" label="Pasajeros" error={problem}>
        <Input
          id="search-passengers"
          icon={Users}
          type="number"
          inputMode="numeric"
          min={1}
          max={SEAT_SELECTION_MAX}
          value={passengers}
          onChange={(event) => setPassengers(event.target.value)}
          {...invalidProps('search-passengers', problem)}
        />
      </Field>
      <Button type="submit" className="md:col-span-2 lg:col-span-1">
        <Search aria-hidden strokeWidth={1.75} className="size-4.5" />
        Buscar viajes
      </Button>
    </form>
  );
}
