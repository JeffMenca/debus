'use client';

import { MAX_PAGE_SIZE, guatemalaDateTime, todayInGuatemala } from '@debus/contracts';
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
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDriverOptions } from '@/hooks/use-drivers';
import { useRoutesPage } from '@/hooks/use-routes';
import { useScheduleTrip } from '@/hooks/use-trips';
import { messageOf } from '@/lib/api/client';
import { formatPlate } from '@/lib/format';
import {
  type ClashField,
  type DayTime,
  type ScheduleProblems,
  clashFieldOf,
  scheduleRequestFrom,
  splitGuatemala,
  suggestedArrival,
} from '@/lib/trips/schedule';
import { OptionSelect } from './option-select';
import { TimeField } from './time-field';

// The server pages its lists; a select asks for the largest page and, when needed, a search.
const OPTIONS_PAGE = { page: 1, pageSize: MAX_PAGE_SIZE } as const;

function useSearch() {
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  return [search, setSearch, term || undefined] as const;
}

interface ScheduleTripFormProps {
  defaultDay: string;
  onDone: () => void;
}

function ScheduleTripForm({ defaultDay, onDone }: ScheduleTripFormProps) {
  const schedule = useScheduleTrip();
  const [routeSearch, setRouteSearch, routeTerm] = useSearch();
  const [busSearch, setBusSearch, busTerm] = useSearch();
  const [driverSearch, setDriverSearch, driverTerm] = useSearch();
  const routes = useRoutesPage({
    status: 'active',
    ...(routeTerm && { q: routeTerm }),
    ...OPTIONS_PAGE,
  }).data;
  const buses = useBusesPage({
    status: 'AVAILABLE',
    ...(busTerm && { q: busTerm }),
    ...OPTIONS_PAGE,
  }).data;
  const drivers = useDriverOptions(driverTerm).data;

  const [routeId, setRouteId] = useState('');
  const [busId, setBusId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [departure, setDeparture] = useState<DayTime>({ day: defaultDay, time: '' });
  // Null until the person edits the arrival: until then it follows the route and the departure.
  const [editedArrival, setEditedArrival] = useState<DayTime | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [clash, setClash] = useState<{ field: ClashField | null; message: string } | null>(null);

  const route = routes?.items.find((item) => item.id === routeId);
  const bus = buses?.items.find((item) => item.id === busId);
  const proposed =
    route && departure.day && departure.time
      ? splitGuatemala(
          suggestedArrival(guatemalaDateTime(departure.day, departure.time), route.distanceKm),
        )
      : null;
  const arrival = editedArrival ?? proposed ?? { day: departure.day, time: '' };

  const result = scheduleRequestFrom({ routeId, busId, driverId, departure, arrival });
  const problems: ScheduleProblems = attempted ? (result.problems ?? {}) : {};
  const clashOn = (field: ClashField) => (clash?.field === field ? clash.message : undefined);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    setClash(null);
    if (!result.request) return;
    try {
      await schedule.mutateAsync(result.request);
    } catch (error) {
      const message = messageOf(error);
      setClash({ field: clashFieldOf(message), message });
      return;
    }
    toast.success(`Programamos el viaje a ${route?.destinationName ?? 'ese destino'}.`);
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
        id="trip-route"
        label="Ruta"
        placeholder="Elige la ruta"
        options={(routes?.items ?? []).map((item) => ({
          value: item.id,
          label: `${item.originName} → ${item.destinationName}`,
        }))}
        total={routes?.total ?? 0}
        value={routeId}
        onChange={setRouteId}
        search={routeSearch}
        onSearchChange={setRouteSearch}
        searchLabel="Buscar ruta"
        emptyMessage="No hay rutas activas. Crea una en Rutas."
        error={problems.routeId ?? clashOn('route')}
      />
      <OptionSelect
        id="trip-bus"
        label="Bus"
        placeholder="Elige el bus"
        options={(buses?.items ?? []).map((item) => ({
          value: item.id,
          label: `${formatPlate(item.plate)} · ${item.capacity} asientos`,
        }))}
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
        id="trip-driver"
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
          id="trip-departure-day"
          label="Día de salida"
          value={departure.day}
          min={todayInGuatemala()}
          onChange={(day) => setDeparture({ ...departure, day })}
          error={problems.departureDay}
        />
        <TimeField
          id="trip-departure-time"
          label="Hora de salida"
          value={departure.time}
          onChange={(time) => setDeparture({ ...departure, time })}
          error={problems.departureTime ?? clashOn('departure')}
        />
        <DateField
          id="trip-arrival-day"
          label="Día de llegada"
          value={arrival.day}
          min={departure.day}
          onChange={(day) => setEditedArrival({ ...arrival, day })}
          hint="Te la proponemos según la distancia"
          error={problems.arrivalDay}
        />
        <TimeField
          id="trip-arrival-time"
          label="Hora de llegada"
          value={arrival.time}
          onChange={(time) => setEditedArrival({ ...arrival, time })}
          error={problems.arrivalTime}
        />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={schedule.isPending}>
          {schedule.isPending ? 'Programando...' : 'Programar'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

interface ScheduleTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The day the departure starts on; the person can change it.
  defaultDay: string;
}

export function ScheduleTripDialog({ open, onOpenChange, defaultDay }: ScheduleTripDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Programar viaje</DialogTitle>
          <DialogDescription>
            Elige la ruta, el bus y el chofer. Las horas son de Guatemala.
          </DialogDescription>
        </DialogHeader>
        <ScheduleTripForm defaultDay={defaultDay} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
