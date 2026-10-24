'use client';

import { todayInGuatemala } from '@debus/contracts';
import { Building2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { FormAlert } from '@/components/auth/form-alert';
import { Button } from '@/components/ui/button';
import { Field, invalidProps } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBranchLocations } from '@/hooks/use-branch-locations';
import { messageOf } from '@/lib/api/client';
import {
  type RentalDraft,
  type RentalProblems,
  emptyRentalDraft,
  rentalRequestFrom,
} from '@/lib/rentals/rental-form';
import { useRequestRental } from '@/lib/rentals/rentals-api';
import { RentalEstimate } from './rental-estimate';
import { RentalTripFields } from './rental-trip-fields';

// The client asks for a bus: the branch confirms the price and the client pays it from the wallet.
export function RentalRequestCard({ today = todayInGuatemala() }: { today?: string }) {
  const branches = useBranchLocations().data ?? [];
  const requestRental = useRequestRental();
  const [draft, setDraft] = useState<RentalDraft>(() => emptyRentalDraft(today));
  const [problems, setProblems] = useState<RentalProblems>({});

  function change(patch: Partial<RentalDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setProblems({});
    requestRental.reset();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = rentalRequestFrom(draft, new Date());
    if (!result.request) {
      setProblems(result.problems ?? {});
      return;
    }
    try {
      await requestRental.mutateAsync(result.request);
    } catch {
      return;
    }
    toast.success(
      'Recibimos tu solicitud. Te avisaremos por correo cuando la sucursal confirme el precio.',
    );
    setDraft(emptyRentalDraft(today));
  }

  return (
    <section
      aria-labelledby="rental-request-title"
      className="flex animate-arrive flex-col gap-5 rounded-[28px] bg-coral-100 p-6 motion-reduce:animate-none sm:p-7"
    >
      <div className="flex flex-col gap-1.5 text-coral-700">
        <h2 id="rental-request-title" className="font-display text-[26px] leading-none font-bold">
          Pide tu bus
        </h2>
        <p className="text-[15px]">Cuéntanos a dónde van y te decimos cuánto costaría.</p>
      </div>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Field id="rental-branch" label="Sucursal que te atiende" error={problems.branchId}>
          <Select
            value={draft.branchId}
            onValueChange={(branchId) => branchId && change({ branchId })}
          >
            <SelectTrigger
              id="rental-branch"
              className="w-full bg-card"
              {...invalidProps('rental-branch', problems.branchId)}
            >
              {/* A long branch name is cut with an ellipsis instead of widening the form. */}
              <span className="flex min-w-0 items-center gap-2.5 overflow-hidden">
                <Building2
                  aria-hidden
                  strokeWidth={1.75}
                  className="size-5 shrink-0 text-primary"
                />
                <SelectValue placeholder="Elige la sucursal" className="min-w-0 truncate" />
              </span>
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name} · {branch.municipality}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <RentalTripFields
          idPrefix="rental"
          draft={draft}
          onChange={change}
          problems={problems}
          today={today}
        />
        <RentalEstimate distance={draft.distance} />
        {requestRental.isError && (
          <FormAlert tone="error">{messageOf(requestRental.error)}</FormAlert>
        )}
        <Button type="submit" disabled={requestRental.isPending}>
          {requestRental.isPending ? 'Enviando...' : 'Pedir cotización'}
        </Button>
      </form>
    </section>
  );
}
