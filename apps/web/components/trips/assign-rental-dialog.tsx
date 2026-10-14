'use client';

import type { RentalToAssign } from '@debus/contracts';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormAlert } from '@/components/auth/form-alert';
import { DateField } from '@/components/forms/date-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBusesPage } from '@/hooks/use-buses';
import { useDriverOptions } from '@/hooks/use-drivers';
import { useAssignRental } from '@/hooks/use-rental-requests';
import { messageOf } from '@/lib/api/client';
import { formatPlate } from '@/lib/format';
import {
  type AssignClashField,
  type AssignProblems,
  assignClashFieldOf,
  assignRequestFrom,
  defaultRentalArrival,
} from '@/lib/trips/rental';
import type { DayTime } from '@/lib/trips/schedule';
import { OPTIONS_PAGE, useOptionSearch } from './option-search';
import { OptionSelect } from './option-select';
import { TimeField } from './time-field';

const focusField = (id: string) => document.getElementById(id)?.focus();
const CLASH_FIELD_ID: Record<AssignClashField, string> = {
  bus: 'assign-bus',
  driver: 'assign-driver',
  arrival: 'assign-arrival-day',
};

function AssignRentalForm({ request, onDone }: { request: RentalToAssign; onDone: () => void }) {
  const assign = useAssignRental(request.id);
  const [busSearch, setBusSearch, busTerm] = useOptionSearch();
  const [driverSearch, setDriverSearch, driverTerm] = useOptionSearch();
  const buses = useBusesPage({
    status: 'AVAILABLE',
    ...(busTerm && { q: busTerm }),
    ...OPTIONS_PAGE,
  }).data;
  const drivers = useDriverOptions(driverTerm).data;

  const [busId, setBusId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [arrival, setArrival] = useState<DayTime>(() => defaultRentalArrival(request));
  const [attempted, setAttempted] = useState(false);
  const [clash, setClash] = useState<{ field: AssignClashField | null; message: string } | null>(
    null,
  );

  const result = assignRequestFrom({ busId, driverId, arrival }, request);
  const problems: AssignProblems = attempted ? (result.problems ?? {}) : {};
  const clashOn = (field: AssignClashField) => (clash?.field === field ? clash.message : undefined);
  const bus = buses?.items.find((item) => item.id === busId);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    setClash(null);
    if (!result.request) return;
    try {
      await assign.mutateAsync(result.request);
    } catch (error) {
      const message = messageOf(error);
      const field = assignClashFieldOf(message);
      setClash({ field, message });
      // The select is not a registered field, so the field with the problem is focused directly.
      if (field) setTimeout(() => focusField(CLASH_FIELD_ID[field]), 0);
      return;
    }
    toast.success(`Asignamos el bus y el chofer a ${request.clientName}.`);
    onDone();
  }

  function chooseBus(id: string) {
    setBusId(id);
    // The plant driver is the usual one for that bus; the person can still pick another.
    const assignedDriverId = buses?.items.find((item) => item.id === id)?.assignedDriverId;
    if (assignedDriverId) setDriverId(assignedDriverId);
  }

  const plantDriver =
    bus?.assignedDriverId && bus.assignedDriverName
      ? { value: bus.assignedDriverId, label: bus.assignedDriverName }
      : undefined;

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {clash && !clash.field && <FormAlert tone="error">{clash.message}</FormAlert>}
      <OptionSelect
        id="assign-bus"
        label="Bus"
        placeholder="Elige el bus"
        options={(buses?.items ?? []).map((item) => {
          const small = item.capacity < request.passengers;
          return {
            value: item.id,
            label: `${formatPlate(item.plate)} · ${item.capacity} asientos${small ? ' (menos asientos)' : ''}`,
            disabled: small,
          };
        })}
        total={buses?.total ?? 0}
        value={busId}
        onChange={chooseBus}
        search={busSearch}
        onSearchChange={setBusSearch}
        searchLabel="Buscar bus"
        emptyMessage="No hay buses disponibles. Revisa su estado en Buses."
        error={problems.busId ?? clashOn('bus')}
      />
      <OptionSelect
        id="assign-driver"
        label="Chofer"
        placeholder="Elige el chofer"
        options={(drivers?.items ?? []).map((item) => ({ value: item.id, label: item.fullName }))}
        total={drivers?.total ?? 0}
        value={driverId}
        onChange={setDriverId}
        search={driverSearch}
        onSearchChange={setDriverSearch}
        searchLabel="Buscar chofer"
        emptyMessage="No hay choferes activos. Registra uno en Choferes."
        error={problems.driverId ?? clashOn('driver')}
        pinned={plantDriver}
      />
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <DateField
          id="assign-arrival-day"
          label="Día de llegada"
          value={arrival.day}
          onChange={(day) => setArrival({ ...arrival, day })}
          hint="Te la proponemos según el alquiler"
          error={problems.arrivalDay ?? clashOn('arrival')}
        />
        <TimeField
          id="assign-arrival-time"
          label="Hora de llegada"
          value={arrival.time}
          onChange={(time) => setArrival({ ...arrival, time })}
          error={problems.arrivalTime}
        />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={assign.isPending}>
          {assign.isPending ? 'Asignando...' : 'Asignar'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

interface AssignRentalDialogProps {
  // The rental waiting for a bus and a driver; null keeps the dialog closed.
  request: RentalToAssign | null;
  onOpenChange: (open: boolean) => void;
}

export function AssignRentalDialog({ request, onOpenChange }: AssignRentalDialogProps) {
  return (
    <Dialog open={Boolean(request)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {request && (
          <>
            <DialogHeader>
              <DialogTitle>Asignar bus y chofer</DialogTitle>
              <DialogDescription>
                {request.clientName} · {request.originLabel} a {request.destinationLabel} ·{' '}
                {request.passengers} pasajeros. Las horas son de Guatemala.
              </DialogDescription>
            </DialogHeader>
            <AssignRentalForm
              key={request.id}
              request={request}
              onDone={() => onOpenChange(false)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
