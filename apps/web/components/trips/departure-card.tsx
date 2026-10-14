'use client';

import type { TripDetail } from '@debus/contracts';
import { Check, Play } from 'lucide-react';
import { useState } from 'react';
import { FormAlert } from '@/components/auth/form-alert';
import { ConfirmDialog } from '@/components/forms/confirm-dialog';
import { DateField } from '@/components/forms/date-field';
import { Button } from '@/components/ui/button';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useRecordDeparture } from '@/hooks/use-trip';
import { formatKm, formatPlate } from '@/lib/format';
import { departureRequestFrom, formatMoment, nowInGuatemala } from '@/lib/trips/cycle';
import {
  CONFIRM_RECORD,
  CardTitle,
  Fact,
  LockedNote,
  RecordSection,
  RecordedByNote,
  Summary,
} from './record-parts';
import { TimeField } from './time-field';
import { useRecordForm } from './use-record-form';

function RecordedDeparture({ trip }: { trip: TripDetail }) {
  const departure = trip.departure!;
  return (
    <RecordSection recorded>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle icon={Check} tone="mint">
          Salida
        </CardTitle>
        <LockedNote />
      </div>
      <dl className="m-0 grid grid-cols-2 gap-3 text-foreground">
        <Fact label="Fecha y hora real" value={formatMoment(departure.departedAt)} />
        <Fact label="Kilometraje inicial" value={formatKm(departure.startMileageKm)} />
        <Fact label="Bus" value={formatPlate(trip.busPlate)} />
        <Fact label="Chofer" value={trip.driverName} mono={false} />
      </dl>
      <RecordedByNote role={departure.recordedByRole} />
    </RecordSection>
  );
}

function blockedReason(trip: TripDetail): string | null {
  if (!trip.busActive) {
    return 'El bus de este viaje fue desactivado, así que no se puede registrar la salida. El administrador de la sucursal debe eliminar el viaje y programarlo de nuevo con otro bus.';
  }
  if (!trip.driverActive) {
    return 'El chofer de este viaje fue desactivado, así que no se puede registrar la salida. El administrador de la sucursal debe eliminar el viaje y programarlo de nuevo con otro chofer.';
  }
  return null;
}

function DepartureForm({ trip }: { trip: TripDetail }) {
  const record = useRecordDeparture(trip.id);
  const [values, setValues] = useState(() => ({
    ...nowInGuatemala(),
    mileage: String(trip.suggestedStartMileageKm),
  }));
  const result = departureRequestFrom(values, trip.departureAt);
  const { problems, serverError, confirming, setConfirming, review, save } = useRecordForm({
    idPrefix: 'departure',
    outcome: result,
    record: record.mutateAsync,
    savedMessage: 'Registramos la salida.',
  });
  const blocked = blockedReason(trip);
  const today = nowInGuatemala().day;

  const set = (patch: Partial<typeof values>) => setValues({ ...values, ...patch });

  return (
    <RecordSection>
      <CardTitle icon={Play} tone="mango">
        Salida
      </CardTitle>
      {blocked && <FormAlert tone="error">{blocked}</FormAlert>}
      {serverError && <FormAlert tone="error">{serverError}</FormAlert>}
      <div className="grid grid-cols-1 gap-3.5 min-[420px]:grid-cols-2">
        <DateField
          id="departure-day"
          label="Fecha"
          value={values.day}
          max={today}
          onChange={(day) => set({ day })}
          error={problems.day}
        />
        <TimeField
          id="departure-time"
          label="Hora"
          value={values.time}
          onChange={(time) => set({ time })}
          error={problems.time}
        />
        <div className="min-[420px]:col-span-2">
          <Field id="departure-mileage" label="Kilometraje inicial" error={problems.mileage}>
            <Input
              id="departure-mileage"
              inputMode="numeric"
              autoComplete="off"
              value={values.mileage}
              onChange={(event) => set({ mileage: event.target.value })}
              className="font-mono tabular-nums"
              {...invalidProps('departure-mileage', problems.mileage)}
            />
          </Field>
        </div>
      </div>
      <div className="mt-auto flex justify-end">
        <Button type="button" disabled={Boolean(blocked)} onClick={review} className="h-12.5">
          <Play aria-hidden strokeWidth={1.75} className="size-4.5" />
          Registrar salida
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="¿Registrar la salida?"
        description={CONFIRM_RECORD.description}
        confirmLabel="Sí, registrar salida"
        checkLabel={CONFIRM_RECORD.checkLabel}
        details={
          result.request && (
            <Summary
              rows={[
                ['Hora de salida', formatMoment(result.request.departedAt)],
                ['Kilometraje inicial', formatKm(result.request.startMileageKm)],
              ]}
            />
          )
        }
        onConfirm={save}
      />
    </RecordSection>
  );
}

// The departure of the trip: a form to record it, or the record once it exists (it cannot change).
export function DepartureCard({ trip }: { trip: TripDetail }) {
  return trip.departure ? <RecordedDeparture trip={trip} /> : <DepartureForm trip={trip} />;
}
