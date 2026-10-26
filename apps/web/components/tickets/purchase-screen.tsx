'use client';

import { type Purchase, todayInGuatemala } from '@debus/contracts';
import { Armchair, Check, ChevronLeft, Clock, type LucideIcon, Mail, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { FormAlert } from '@/components/auth/form-alert';
import { ErrorAlert } from '@/components/data/error-alert';
import { DateField } from '@/components/forms/date-field';
import { SeatLegend, SeatMap } from '@/components/seats/seat-map';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, messageOf } from '@/lib/api/client';
import { formatPlate, formatQuetzales } from '@/lib/format';
import { readId } from '@/lib/list/page-params';
import { formatSeat, saleTotal, toggleSeat } from '@/lib/tickets/counter-sale';
import { PURCHASE_WAIT_MS, balanceAfter, keepsKey } from '@/lib/tickets/purchase';
import { isTripCancelled, usePurchase, usePurchaseTicket } from '@/lib/tickets/purchase-api';
import { readTripSearch, writeTripSearch } from '@/lib/tickets/trip-search-params';
import { useSeatMap } from '@/lib/tickets/trips-api';
import { cn } from '@/lib/utils';
import { useWallet } from '@/lib/wallet/wallet-api';
import { PurchaseReceipt } from './purchase-receipt';
import { TripCancelled } from './trip-cancelled';
import { TripTicketCard } from './trip-ticket-card';

interface PurchaseScreenProps {
  tripId: string;
  today?: string;
}

const seatCount = (count: number) => (count === 1 ? '1 asiento' : `${count} asientos`);

function payLabel(paying: boolean, seats: number, total: number): string {
  if (paying) return 'Pagando...';
  if (seats === 0) return 'Pagar';
  return `Pagar ${formatQuetzales(total)}`;
}

function BackLink({ href }: { href: string }) {
  return (
    <Button asChild variant="ghost" className="pl-2">
      <Link href={href}>
        <ChevronLeft aria-hidden strokeWidth={1.75} className="size-4.5" />
        Volver a viajes
      </Link>
    </Button>
  );
}

// The trip is chosen; the seats and the payment happen on this screen.
const STEPS: { label: string; icon: LucideIcon; tone: string; current?: boolean }[] = [
  { label: 'Viaje', icon: Check, tone: 'bg-mint-100 text-mint-700' },
  { label: 'Asientos', icon: Armchair, tone: 'bg-primary text-primary-foreground', current: true },
  { label: 'Pago', icon: Wallet, tone: 'text-muted-foreground' },
];

function Steps() {
  return (
    <ol
      aria-label="Pasos de la compra"
      className="flex gap-1 rounded-2xl bg-card p-1 text-sm font-semibold"
    >
      {STEPS.map(({ label, icon: Icon, tone, current }) => (
        <li
          key={label}
          aria-current={current ? 'step' : undefined}
          className={cn('flex items-center gap-1.5 rounded-xl px-3 py-1.5', tone)}
        >
          <Icon aria-hidden strokeWidth={1.75} className="size-4" />
          {label}
        </li>
      ))}
    </ol>
  );
}

function TripMissing({ back, message }: { back: string; message: string }) {
  return (
    <section
      aria-labelledby="trip-missing-title"
      className="mx-auto flex max-w-lg flex-col items-start gap-4 rounded-[26px] bg-card p-6"
    >
      <h1 id="trip-missing-title" className="font-display text-[26px] font-bold">
        No encontramos ese viaje
      </h1>
      <p className="text-muted-foreground">{message}</p>
      <BackLink href={back} />
    </section>
  );
}

function Waiting({ message, gaveUp }: { message: string; gaveUp: boolean }) {
  return (
    <section
      aria-labelledby="purchase-waiting-title"
      className="mx-auto flex w-full max-w-lg flex-col gap-4 rounded-[26px] bg-card p-6"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-mango-100 text-mango-700">
          <Clock aria-hidden strokeWidth={1.75} className="size-6" />
        </span>
        <h1 id="purchase-waiting-title" className="font-display text-[26px] font-bold">
          Pago en confirmación
        </h1>
      </div>
      {gaveUp ? (
        <>
          <FormAlert tone="info">Seguimos confirmando tu pago. Lo verás en Mis boletos.</FormAlert>
          <Button asChild>
            <Link href="/cuenta">Ir a Mis boletos</Link>
          </Button>
        </>
      ) : (
        <FormAlert tone="info">{message}</FormAlert>
      )}
    </section>
  );
}

// /viajes/[viajeId]/asientos: an address that is not a trip asks the server for nothing.
export function PurchaseScreen({ tripId, today = todayInGuatemala() }: PurchaseScreenProps) {
  const params = useSearchParams();
  const search = readTripSearch(new URLSearchParams(params.toString()));
  const query = writeTripSearch(search).toString();
  const back = query ? `/viajes?${query}` : '/viajes';
  const id = readId(tripId);
  if (!id) {
    return (
      <TripMissing back={back} message="Revisa el enlace o busca el viaje otra vez en Viajes." />
    );
  }
  return <PurchaseFlow tripId={id} back={back} passengers={search.passengers} today={today} />;
}

interface PurchaseFlowProps {
  tripId: string;
  back: string;
  passengers: number;
  today: string;
}

function PurchaseFlow({ tripId, back, passengers, today }: PurchaseFlowProps) {
  const wallet = useWallet();
  const buy = usePurchaseTicket();
  const [picked, setPicked] = useState<number[]>([]);
  const [paidOn, setPaidOn] = useState(today);
  // The key of the next payment. Any answer of the server spends it; only a lost answer keeps it.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [spent, setSpent] = useState(false);
  const [pending, setPending] = useState<Purchase | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const followed = usePurchase(pending, !gaveUp);
  // A trip deleted during the payment, or gone before it, has no seat map left to ask for.
  const cancelled = [buy.data, followed.data].find(isTripCancelled);
  const gone = buy.error instanceof ApiError && buy.error.status === 404 ? buy.error : null;
  const map = useSeatMap(cancelled || gone ? null : tripId);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setGaveUp(true), PURCHASE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  const confirmed = [buy.data, followed.data].find((purchase) => purchase?.status === 'CONFIRMED');
  if (confirmed?.ticket) return <PurchaseReceipt ticket={confirmed.ticket} />;
  if (cancelled) return <TripCancelled message={cancelled.message ?? ''} back={back} />;
  if (gone) return <TripMissing back={back} message={gone.message} />;
  if (pending && followed.data?.status === 'PENDING') {
    return <Waiting message={followed.data.message ?? ''} gaveUp={gaveUp} />;
  }

  if (map.error instanceof ApiError && map.error.status === 404) {
    return <TripMissing back={back} message={map.error.message} />;
  }

  // A seat sold by someone else in the meantime leaves the choice when the map comes back.
  const seats = picked.filter((seat) => !map.data?.taken.includes(seat));
  const total = map.data ? saleTotal(map.data.ticketPrice, seats.length) : 0;
  const balance = wallet.data?.balance;
  const after = balance === undefined ? undefined : balanceAfter(balance, total);
  const failed = followed.data?.status === 'FAILED' ? followed.data.message : null;
  const problem = buy.isError ? messageOf(buy.error) : failed;

  function forgetLastAnswer() {
    buy.reset();
    setPending(null);
    setGaveUp(false);
  }

  function change(update: () => void) {
    update();
    setSpent(true);
    forgetLastAnswer();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!map.data || seats.length === 0) return;
    const nextKey = spent ? crypto.randomUUID() : key;
    setKey(nextKey);
    setSpent(false);
    forgetLastAnswer();
    buy.mutate(
      { key: nextKey, request: { tripId, seats, paidOn } },
      {
        onSuccess: (purchase) => {
          setSpent(true);
          if (purchase.status === 'PENDING') setPending(purchase);
        },
        onError: (error) => setSpent(!keepsKey(error)),
      },
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink href={back} />
        <Steps />
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
      {map.data && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section aria-labelledby="purchase-title" className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h1
                  id="purchase-title"
                  className="font-display text-[34px] leading-none font-bold sm:text-[44px]"
                >
                  Elige tus asientos
                </h1>
                <p className="font-mono text-sm text-muted-foreground">
                  {formatPlate(map.data.busPlate)} · {seatCount(map.data.capacity)}
                  {passengers > 1 && ` · ${passengers} pasajeros`}
                </p>
              </div>
              <SeatLegend />
            </div>
            <div className="rounded-[36px] bg-sky-100 px-3 py-6 sm:px-6">
              <SeatMap
                capacity={map.data.capacity}
                taken={map.data.taken}
                selected={seats}
                onToggle={(seat) => change(() => setPicked(toggleSeat(seats, seat)))}
              />
            </div>
          </section>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
            <TripTicketCard trip={map.data} />
            <form
              noValidate
              onSubmit={submit}
              aria-label="Pago con cartera"
              className="flex flex-col gap-4 rounded-[26px] bg-card p-6"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold">Asientos elegidos</span>
                <span className="text-[13px] text-muted-foreground">{seatCount(seats.length)}</span>
              </div>
              {seats.length > 0 ? (
                <ul aria-label="Asientos elegidos" className="flex flex-wrap gap-2">
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
              <dl className="flex flex-col gap-2 rounded-2xl bg-muted p-4 text-sm">
                <div className="flex justify-between gap-3">
                  <dt>
                    {seatCount(seats.length)} × {formatQuetzales(map.data.ticketPrice)}
                  </dt>
                  <dd className="font-mono font-semibold tabular-nums">{formatQuetzales(total)}</dd>
                </div>
                {balance !== undefined && after !== undefined && (
                  <>
                    <div className="flex justify-between gap-3">
                      <dt>Saldo en cartera</dt>
                      <dd className="font-mono tabular-nums">{formatQuetzales(balance)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Saldo después del pago</dt>
                      <dd
                        className={cn(
                          'font-mono font-semibold tabular-nums',
                          after < 0 ? 'text-rose-700' : 'text-mint-700',
                        )}
                      >
                        {formatQuetzales(after)}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
              {after !== undefined && after < 0 && (
                <p className="text-[13px] text-rose-700">
                  Tu saldo no alcanza. Recarga en Mi cuenta.
                </p>
              )}
              <DateField
                id="purchase-paid-on"
                label="Fecha de pago"
                value={paidOn}
                hint="Hoy por defecto"
                onChange={(value) => change(() => setPaidOn(value || today))}
              />
              {problem && <FormAlert tone="error">{problem}</FormAlert>}
              <Button type="submit" size="lg" disabled={seats.length === 0 || buy.isPending}>
                <Wallet aria-hidden strokeWidth={1.75} className="size-4.5" />
                {payLabel(buy.isPending, seats.length, total)}
              </Button>
              <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
                <Mail aria-hidden strokeWidth={1.75} className="mt-px size-4 shrink-0" />
                Tus asientos se apartan al pagar y te enviamos los boletos por correo.
              </p>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}
