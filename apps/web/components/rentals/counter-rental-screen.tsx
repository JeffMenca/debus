'use client';

import { type ClientOption, type Rental, todayInGuatemala } from '@debus/contracts';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { FormAlert } from '@/components/auth/form-alert';
import { OptionSelect } from '@/components/forms/option-select';
import { useOptionSearch } from '@/components/forms/option-search';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useBranchDepartments } from '@/hooks/use-branch-locations';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useOwnBranch } from '@/hooks/use-own-branch';
import { messageOf } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session-store';
import { inputRules } from '@/lib/forms/input-rules';
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
import {
  useClientOptions,
  useRegisterCounterRental,
  useRentalEstimate,
} from '@/lib/rentals/rentals-api';
import { RentalEstimate } from './rental-estimate';
import { RentalTripFields } from './rental-trip-fields';

const clientLabel = ({ fullName, email, nit }: ClientOption): string =>
  [fullName, email, nit && `NIT ${nit}`].filter(Boolean).join(' · ');

// A client agrees the trip and the price at the counter, then pays from their own wallet.
export function CounterRentalScreen({ today = todayInGuatemala() }: { today?: string }) {
  const router = useRouter();
  const branchId = useSession()?.user.branchId ?? '';
  const branch = useOwnBranch();
  const register = useRegisterCounterRental();
  const [draft, setDraft] = useState<RentalDraft>(() => emptyRentalDraft(today));
  const [counter, setCounter] = useState<CounterDraft>(emptyCounterDraft);
  const [priceTouched, setPriceTouched] = useState(false);
  const [problems, setProblems] = useState<RentalProblems & CounterProblems>({});
  const departments = useBranchDepartments();
  const [clientSearch, setClientSearch, clientTerm] = useOptionSearch();
  const clients = useClientOptions(clientTerm);
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
    let rental: Rental;
    try {
      rental = await register.mutateAsync(result.request);
    } catch {
      return;
    }
    toast.success(
      `Registramos el alquiler de ${rental.clientName}. Le avisamos por correo para que lo pague con su cartera.`,
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
            departments={departments.data ?? []}
          />
          {departments.isError && (
            <FormAlert tone="error">No pudimos cargar los departamentos.</FormAlert>
          )}
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
          <OptionSelect
            id="counter-rental-client"
            label="Cliente"
            placeholder="Elige al cliente"
            options={(clients.data?.items ?? []).map((client) => ({
              value: client.userId,
              label: clientLabel(client),
            }))}
            total={clients.data?.total ?? 0}
            value={counter.clientId}
            onChange={(clientId) => changeCounter({ clientId })}
            search={clientSearch}
            onSearchChange={setClientSearch}
            searchLabel="Buscar cliente"
            emptyMessage="Todavía no hay clientes con cuenta."
            error={problems.clientId}
            alwaysSearch
          />
          {clients.isError && <FormAlert tone="error">No pudimos cargar los clientes.</FormAlert>}
          <p className="text-[13px] text-coral-700">
            El cliente lo paga con su cartera digital, desde su cuenta. Le avisamos por correo.
          </p>
          <RentalEstimate distance={draft.distance} />
          <Field id="counter-rental-price" label="Precio acordado" error={problems.price}>
            <Input
              id="counter-rental-price"
              rule={inputRules.decimal(7, 2)}
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
