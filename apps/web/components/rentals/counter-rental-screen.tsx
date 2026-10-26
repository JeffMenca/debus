'use client';

import { todayInGuatemala } from '@debus/contracts';
import { Mail, ReceiptText, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { FormAlert } from '@/components/auth/form-alert';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useOwnBranch } from '@/hooks/use-own-branch';
import { messageOf } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session-store';
import {
  type CounterDraft,
  type CounterProblems,
  type RentalDraft,
  type RentalProblems,
  counterRequestFrom,
  emptyCounterDraft,
  emptyRentalDraft,
  parseDistance,
} from '@/lib/rentals/rental-form';
import { branchRentalsHref } from '@/lib/rentals/rental-list-params';
import { useRegisterCounterRental, useRentalEstimate } from '@/lib/rentals/rentals-api';
import { RentalEstimate } from './rental-estimate';
import { RentalTripFields } from './rental-trip-fields';

// A walk-in client agrees the trip and the price at the counter; the cash is taken afterwards.
export function CounterRentalScreen({ today = todayInGuatemala() }: { today?: string }) {
  const router = useRouter();
  const branchId = useSession()?.user.branchId ?? '';
  const branch = useOwnBranch();
  const register = useRegisterCounterRental();
  const [draft, setDraft] = useState<RentalDraft>(() => emptyRentalDraft(today));
  const [counter, setCounter] = useState<CounterDraft>(emptyCounterDraft);
  const [priceTouched, setPriceTouched] = useState(false);
  const [problems, setProblems] = useState<RentalProblems & CounterProblems>({});
  const estimate = useRentalEstimate(useDebouncedValue(parseDistance(draft.distance))).data;
  // The price starts on the estimate until the admin writes another one.
  const price = priceTouched ? counter.price : String(estimate?.estimatedPrice ?? '');

  function changeTrip(patch: Partial<RentalDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setProblems({});
    register.reset();
  }
  function changeCounter(patch: Partial<CounterDraft>) {
    setCounter((current) => ({ ...current, ...patch }));
    setProblems({});
    register.reset();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = counterRequestFrom({ ...draft, branchId }, { ...counter, price }, new Date());
    if (!result.request) {
      setProblems(result.problems ?? {});
      return;
    }
    try {
      await register.mutateAsync(result.request);
    } catch {
      return;
    }
    toast.success(
      `Registramos el alquiler de ${result.request.clientName}. Cuando pague, registra el pago en efectivo.`,
    );
    router.push(branchRentalsHref('CONFIRMED'));
  }

  return (
    <>
      <PageHeader
        eyebrow={branch ? `Alquileres · ${branch.name}` : 'Alquileres'}
        title="Alquiler de ventanilla"
      />
      <form
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start"
      >
        <section
          aria-labelledby="counter-trip-title"
          className="flex flex-col gap-4 rounded-[28px] bg-card p-6"
        >
          <h2 id="counter-trip-title" className="font-display text-[22px] font-bold">
            El viaje
          </h2>
          <RentalTripFields
            idPrefix="counter-rental"
            draft={draft}
            onChange={changeTrip}
            problems={problems}
            today={today}
          />
        </section>
        <section
          aria-labelledby="counter-client-title"
          className="flex flex-col gap-4 rounded-[28px] bg-coral-100 p-6"
        >
          <h2
            id="counter-client-title"
            className="font-display text-[22px] font-bold text-coral-700"
          >
            El cliente y el precio
          </h2>
          <Field id="counter-rental-nit" label="NIT" optional error={problems.nit}>
            <Input
              id="counter-rental-nit"
              icon={ReceiptText}
              placeholder="Vacío para consumidor final"
              value={counter.nit}
              onChange={(event) => changeCounter({ nit: event.target.value })}
              className="bg-card font-mono"
              {...invalidProps('counter-rental-nit', problems.nit)}
            />
          </Field>
          <Field id="counter-rental-name" label="Nombre del cliente" error={problems.clientName}>
            <Input
              id="counter-rental-name"
              icon={User}
              maxLength={120}
              value={counter.clientName}
              onChange={(event) => changeCounter({ clientName: event.target.value })}
              className="bg-card"
              {...invalidProps('counter-rental-name', problems.clientName)}
            />
          </Field>
          <Field id="counter-rental-email" label="Correo" optional error={problems.email}>
            <Input
              id="counter-rental-email"
              icon={Mail}
              type="email"
              placeholder="Para enviarle la confirmación"
              value={counter.email}
              onChange={(event) => changeCounter({ email: event.target.value })}
              className="bg-card"
              {...invalidProps('counter-rental-email', problems.email)}
            />
          </Field>
          <RentalEstimate distance={draft.distance} />
          <Field id="counter-rental-price" label="Precio acordado" error={problems.price}>
            <Input
              id="counter-rental-price"
              inputMode="decimal"
              value={price}
              onChange={(event) => {
                setPriceTouched(true);
                changeCounter({ price: event.target.value });
              }}
              className="bg-card font-mono tabular-nums"
              {...invalidProps('counter-rental-price', problems.price)}
            />
          </Field>
          {register.isError && <FormAlert tone="error">{messageOf(register.error)}</FormAlert>}
          <Button type="submit" disabled={register.isPending || !branchId}>
            {register.isPending ? 'Registrando...' : 'Registrar alquiler'}
          </Button>
        </section>
      </form>
    </>
  );
}
