'use client';

import { todayInGuatemala, FULL_NAME_MAX } from '@debus/contracts';
import { ChevronLeft, Wallet } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { FormAlert } from '@/components/auth/form-alert';
import { ErrorAlert } from '@/components/data/error-alert';
import { DateField } from '@/components/forms/date-field';
import { SeatLegend, SeatMap } from '@/components/seats/seat-map';
import { Button } from '@/components/ui/button';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { messageOf } from '@/lib/api/client';
import { formatQuetzales } from '@/lib/format';
import { type InputRule, inputRules } from '@/lib/forms/input-rules';
import { useCounterSale } from '@/lib/tickets/counter-api';
import {
  type BuyerForm,
  type BuyerProblems,
  buyerProblems,
  chargeLabel,
  formatSeat,
  saleTotal,
  toCounterSaleRequest,
  toggleSeat,
} from '@/lib/tickets/counter-sale';
import { useSeatMap } from '@/lib/tickets/trips-api';
import { CounterReceipt } from './counter-receipt';
import { TripMissing, isTripGone, tripGoneTitle } from './trip-missing';
import { TripTicketCard } from './trip-ticket-card';

interface CounterSaleProps {
  tripId: string;
  today?: string;
  onBack: () => void;
}

const EMPTY_BUYER: BuyerForm = { nit: '', buyerName: '', email: '' };
const BUYER_FIELDS: {
  name: keyof BuyerForm;
  label: string;
  rule: InputRule;
  optional?: boolean;
  hint?: string;
}[] = [
  {
    name: 'nit',
    label: 'NIT',
    rule: inputRules.nitOrCf,
    hint: 'Déjalo vacío para consumidor final (CF).',
  },
  { name: 'buyerName', label: 'Nombre', rule: inputRules.text(FULL_NAME_MAX), optional: true },
  { name: 'email', label: 'Correo', rule: inputRules.email, optional: true },
];

// Step two at the counter: seats, buyer and the cash payment of one trip.
export function CounterSale({ tripId, today = todayInGuatemala(), onBack }: CounterSaleProps) {
  const map = useSeatMap(tripId);
  const sale = useCounterSale();
  const [picked, setPicked] = useState<number[]>([]);
  const [buyer, setBuyer] = useState<BuyerForm>(EMPTY_BUYER);
  const [paidOn, setPaidOn] = useState(today);
  // A failed sale is retried with the same key; any change makes it a different sale.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [problems, setProblems] = useState<BuyerProblems>({});

  if (sale.isSuccess) return <CounterReceipt ticket={sale.data} onNext={onBack} />;
  if (isTripGone(map.error)) {
    return (
      <TripMissing message={map.error.message} title={tripGoneTitle(map.error)}>
        <Button variant="ghost" onClick={onBack} className="pl-2">
          <ChevronLeft aria-hidden strokeWidth={1.75} className="size-4.5" />
          Cambiar viaje
        </Button>
      </TripMissing>
    );
  }

  // A seat sold by someone else in the meantime leaves the choice when the map comes back.
  const seats = picked.filter((seat) => !map.data?.taken.includes(seat));
  const total = map.data ? saleTotal(map.data.ticketPrice, seats.length) : 0;

  function change(update: () => void) {
    update();
    setKey(crypto.randomUUID());
    setProblems({});
    sale.reset();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = buyerProblems(buyer);
    setProblems(found);
    if (Object.keys(found).length > 0 || seats.length === 0) return;
    sale.mutate({ key, request: toCounterSaleRequest(tripId, seats, paidOn, buyer) });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Button variant="ghost" onClick={onBack} className="pl-2">
          <ChevronLeft aria-hidden strokeWidth={1.75} className="size-4.5" />
          Cambiar viaje
        </Button>
      </div>
      {map.isError && (
        <ErrorAlert message={messageOf(map.error)} onRetry={() => void map.refetch()} />
      )}
      {!map.isError && !map.data && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Skeleton className="h-[520px] rounded-[36px]" />
          <Skeleton className="h-[420px] rounded-[28px]" />
        </div>
      )}
      {!map.isError && map.data && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section
            aria-labelledby="counter-seats-title"
            className="flex flex-col gap-4 rounded-[36px] bg-sky-100 px-3 py-6 sm:px-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-2">
              <h2 id="counter-seats-title" className="font-display text-[22px] font-bold">
                Asientos
              </h2>
              <SeatLegend />
            </div>
            <SeatMap
              capacity={map.data.capacity}
              taken={map.data.taken}
              selected={seats}
              onToggle={(seat) => change(() => setPicked(toggleSeat(seats, seat)))}
            />
          </section>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
            <TripTicketCard trip={map.data} />
            <form
              noValidate
              onSubmit={submit}
              aria-label="Cobro en ventanilla"
              className="flex flex-col gap-4 rounded-[26px] bg-card p-6"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold">Asientos elegidos</span>
                <span className="text-[13px] text-muted-foreground">
                  {seats.length === 1 ? '1 asiento' : `${seats.length} asientos`}
                </span>
              </div>
              {seats.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {seats.map((seat) => (
                    <li
                      key={seat}
                      className="flex h-8.5 min-w-11.5 items-center justify-center rounded-[10px] bg-mango-300 px-2.5 font-mono text-[13px] font-semibold text-accent-foreground"
                    >
                      {formatSeat(seat)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Toca un asiento libre en el mapa.</p>
              )}
              <div className="flex justify-between rounded-2xl bg-muted p-4 text-sm">
                <span>
                  {seats.length} × {formatQuetzales(map.data.ticketPrice)}
                </span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatQuetzales(total)}
                </span>
              </div>
              {BUYER_FIELDS.map(({ name, label, rule, optional, hint }) => {
                const id = `counter-${name}`;
                return (
                  <Field
                    key={name}
                    id={id}
                    label={label}
                    optional={optional}
                    error={problems[name]}
                  >
                    <Input
                      id={id}
                      autoComplete="off"
                      rule={rule}
                      value={buyer[name]}
                      onChange={(event) =>
                        change(() => setBuyer({ ...buyer, [name]: event.target.value }))
                      }
                      {...invalidProps(id, problems[name])}
                    />
                    {hint && !problems[name] && (
                      <p className="text-[13px] text-muted-foreground">{hint}</p>
                    )}
                  </Field>
                );
              })}
              <DateField
                id="counter-paid-on"
                label="Fecha de pago"
                value={paidOn}
                hint="Hoy por defecto"
                onChange={(value) => change(() => setPaidOn(value || today))}
              />
              {sale.isError && <FormAlert tone="error">{messageOf(sale.error)}</FormAlert>}
              <Button type="submit" size="lg" disabled={seats.length === 0 || sale.isPending}>
                <Wallet aria-hidden strokeWidth={1.75} className="size-4.5" />
                {sale.isPending ? 'Cobrando...' : chargeLabel(total)}
              </Button>
              <p className="text-[13px] text-muted-foreground">
                Se cobra en efectivo en la ventanilla. Los asientos quedan apartados al cobrar.
              </p>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}
