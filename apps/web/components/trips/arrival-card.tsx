'use client';

import type { TripDetail } from '@debus/contracts';
import { Flag } from 'lucide-react';
import { useState } from 'react';
import { FormAlert } from '@/components/auth/form-alert';
import { ConfirmDialog } from '@/components/forms/confirm-dialog';
import { DateField } from '@/components/forms/date-field';
import { Button } from '@/components/ui/button';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useRecordArrival } from '@/hooks/use-trip';
import { formatKm, formatQuetzales } from '@/lib/format';
import { parseWholeNumber } from '@/lib/number-input';
import {
  CYCLE_PROBLEMS,
  arrivalPreview,
  arrivalRequestFrom,
  liveMileageProblem,
  formatMoment,
  nowInGuatemala,
} from '@/lib/trips/cycle';
import { splitGuatemala } from '@/lib/trips/schedule';
import {
  CONFIRM_RECORD,
  CardTitle,
  Fact,
  FIGURES_GRID,
  Figure,
  LockedNote,
  RecordSection,
  RecordedByNote,
  Summary,
} from './record-parts';
import { TimeField } from './time-field';
import { useRecordForm } from './use-record-form';

const NO_RATE = 'Sin monto configurado';

const depreciationLabel = (perKm: number | null) =>
  perKm === null ? 'Depreciación' : `Depreciación · ${formatQuetzales(perKm)}/km`;

function depreciationValue(perKm: number | null, amount: number | null): string {
  if (perKm === null) return NO_RATE;
  if (amount === null) return '—';
  return formatQuetzales(amount);
}

function Figures({
  distanceKm,
  depreciationPerKm,
  depreciationAmount,
  driverPay,
}: {
  distanceKm: number | null;
  depreciationPerKm: number | null;
  depreciationAmount: number | null;
  driverPay: number;
}) {
  return (
    <div className={FIGURES_GRID}>
      <Figure tone="sky" label="Recorrido">
        {distanceKm === null ? '—' : formatKm(distanceKm)}
      </Figure>
      <Figure tone="lilac" label={depreciationLabel(depreciationPerKm)}>
        {depreciationValue(depreciationPerKm, depreciationAmount)}
      </Figure>
      <Figure tone="coral" label="Pago al chofer">
        {formatQuetzales(driverPay)}
      </Figure>
    </div>
  );
}

function RecordedArrival({ trip }: { trip: TripDetail }) {
  const arrival = trip.arrival!;
  return (
    <RecordSection recorded>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle icon={Flag} tone="mint">
          Llegada
        </CardTitle>
        <LockedNote />
      </div>
      <dl className="m-0 grid grid-cols-2 gap-3 text-foreground">
        <Fact label="Fecha y hora real" value={formatMoment(arrival.arrivedAt)} />
        <Fact label="Kilometraje final" value={formatKm(arrival.endMileageKm)} />
        <Fact label="Combustible" value={formatQuetzales(arrival.fuelCost)} />
      </dl>
      <Figures
        distanceKm={arrival.distanceKm}
        depreciationPerKm={arrival.depreciationPerKm}
        depreciationAmount={arrival.depreciationAmount}
        driverPay={arrival.driverPay}
      />
      <RecordedByNote role={arrival.recordedByRole} />
    </RecordSection>
  );
}

function ArrivalForm({ trip }: { trip: TripDetail }) {
  const departure = trip.departure!;
  const record = useRecordArrival(trip.id);
  const [values, setValues] = useState(() => ({ ...nowInGuatemala(), mileage: '', fuel: '' }));
  const result = arrivalRequestFrom(values, departure);
  const { problems, serverError, confirming, setConfirming, review, save } = useRecordForm({
    idPrefix: 'arrival',
    outcome: result,
    record: record.mutateAsync,
    savedMessage: 'Registramos la llegada.',
  });
  const departureDay = splitGuatemala(departure.departedAt).day;

  const typedMileage = parseWholeNumber(values.mileage);
  const preview = arrivalPreview({
    startMileageKm: departure.startMileageKm,
    endMileageKm: typedMileage,
    depreciationPerKm: trip.depreciationPerKmToday,
    expectedDriverPay: trip.expectedDriverPay,
  });
  // Said while typing, like the rest of the preview, not only after pressing the button.
  const mileageError =
    problems.mileage ?? liveMileageProblem(typedMileage, departure.startMileageKm);

  const set = (patch: Partial<typeof values>) => setValues({ ...values, ...patch });

  return (
    <RecordSection>
      <CardTitle icon={Flag} tone="mango">
        Llegada
      </CardTitle>
      {serverError && <FormAlert tone="error">{serverError}</FormAlert>}
      <div className="grid grid-cols-1 gap-3.5 min-[420px]:grid-cols-2">
        <DateField
          id="arrival-day"
          label="Fecha"
          value={values.day}
          min={departureDay}
          max={nowInGuatemala().day}
          onChange={(day) => set({ day })}
          error={problems.day}
        />
        <TimeField
          id="arrival-time"
          label="Hora"
          value={values.time}
          onChange={(time) => set({ time })}
          error={problems.time}
        />
        <Field id="arrival-mileage" label="Kilometraje final" error={mileageError}>
          <Input
            id="arrival-mileage"
            inputMode="numeric"
            autoComplete="off"
            value={values.mileage}
            onChange={(event) => set({ mileage: event.target.value })}
            className="font-mono tabular-nums"
            {...invalidProps('arrival-mileage', mileageError)}
          />
        </Field>
        <Field id="arrival-fuel" label="Combustible total (Q)" error={problems.fuel}>
          <Input
            id="arrival-fuel"
            inputMode="decimal"
            autoComplete="off"
            value={values.fuel}
            onChange={(event) => set({ fuel: event.target.value })}
            className="font-mono tabular-nums"
            {...invalidProps('arrival-fuel', problems.fuel)}
          />
        </Field>
      </div>
      <Figures
        distanceKm={preview.distanceKm}
        depreciationPerKm={trip.depreciationPerKmToday}
        depreciationAmount={preview.depreciationAmount}
        driverPay={preview.driverPay}
      />
      <div className="mt-auto flex justify-end">
        <Button type="button" onClick={review} className="h-12.5">
          <Flag aria-hidden strokeWidth={1.75} className="size-4.5" />
          Registrar llegada
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="¿Registrar la llegada?"
        description={CONFIRM_RECORD.description}
        confirmLabel="Sí, registrar llegada"
        checkLabel={CONFIRM_RECORD.checkLabel}
        details={
          result.request && (
            <Summary
              rows={[
                ['Hora de llegada', formatMoment(result.request.arrivedAt)],
                ['Kilometraje final', formatKm(result.request.endMileageKm)],
                ['Combustible', formatQuetzales(result.request.fuelCost)],
                [
                  'Depreciación',
                  preview.depreciationAmount === null
                    ? NO_RATE
                    : formatQuetzales(preview.depreciationAmount),
                ],
              ]}
            />
          )
        }
        onConfirm={save}
      />
    </RecordSection>
  );
}

// The arrival of the trip: waits for the departure, then a form, then the saved record (it cannot change).
export function ArrivalCard({ trip }: { trip: TripDetail }) {
  if (trip.arrival) return <RecordedArrival trip={trip} />;
  if (!trip.departure) {
    return (
      <RecordSection>
        <CardTitle icon={Flag} tone="mango">
          Llegada
        </CardTitle>
        <p className="rounded-2xl bg-background px-4 py-6 text-center text-muted-foreground">
          Primero registra la salida.
        </p>
      </RecordSection>
    );
  }
  return <ArrivalForm trip={trip} />;
}
