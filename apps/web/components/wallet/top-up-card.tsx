'use client';

import { todayInGuatemala } from '@debus/contracts';
import { Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { FormAlert } from '@/components/auth/form-alert';
import { DateField } from '@/components/forms/date-field';
import { Button } from '@/components/ui/button';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { isAccountPending } from '@/lib/account/account-state';
import { messageOf } from '@/lib/api/client';
import { formatQuetzales } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DEFAULT_TOP_UP, TOP_UP_PRESETS, parseTopUpAmount, topUpLabel } from '@/lib/wallet/top-up';
import { useTopUp, useWallet } from '@/lib/wallet/wallet-api';

const AMOUNT_PROBLEM = 'Escribe un monto mayor a Q 0, con hasta dos decimales y hasta Q 100,000.';

export function TopUpCard({ today = todayInGuatemala() }: { today?: string }) {
  const topUp = useTopUp();
  const pending = isAccountPending(useWallet().error);
  const [amountText, setAmountText] = useState(String(DEFAULT_TOP_UP));
  const [paidOn, setPaidOn] = useState(today);
  // A failed top-up is retried with the same key; any change makes it a different top-up.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [amountError, setAmountError] = useState<string | undefined>();
  const amount = parseTopUpAmount(amountText);

  function change(update: () => void) {
    update();
    setKey(crypto.randomUUID());
    setAmountError(undefined);
    topUp.reset();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (amount === null) {
      setAmountError(AMOUNT_PROBLEM);
      return;
    }
    try {
      await topUp.mutateAsync({ key, request: { amount, paidOn } });
    } catch {
      return;
    }
    toast.success(`Recargaste ${formatQuetzales(amount)}. Ya puedes usarlo en tus compras.`);
    setKey(crypto.randomUUID());
  }

  return (
    <section
      aria-labelledby="top-up-title"
      className="flex animate-arrive flex-col gap-4 rounded-[26px] bg-mango-100 p-6 [animation-delay:60ms] motion-reduce:animate-none"
    >
      <h2 id="top-up-title" className="font-display text-[22px] font-bold">
        Recargar saldo
      </h2>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div role="group" aria-label="Montos sugeridos" className="flex gap-2">
          {TOP_UP_PRESETS.map((preset) => {
            const pressed = amount === preset;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={pressed}
                onClick={() => change(() => setAmountText(String(preset)))}
                className={cn(
                  'h-11.5 min-w-0 flex-1 rounded-xl font-mono text-sm font-semibold transition-colors',
                  pressed ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
                )}
              >
                Q {preset}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-[2fr_3fr]">
          <Field id="top-up-amount" label="Monto" error={amountError}>
            <Input
              id="top-up-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amountText}
              onChange={(event) => change(() => setAmountText(event.target.value))}
              className="bg-card font-mono tabular-nums"
              {...invalidProps('top-up-amount', amountError)}
            />
          </Field>
          <DateField
            id="top-up-date"
            label="Fecha de recarga"
            value={paidOn}
            onChange={(value) => change(() => setPaidOn(value))}
            hint="Hoy por defecto"
          />
        </div>
        {topUp.isError && <FormAlert tone="error">{messageOf(topUp.error)}</FormAlert>}
        {pending && (
          <p className="text-sm text-mango-700">Podrás recargar en cuanto tu cuenta esté lista.</p>
        )}
        <Button
          type="submit"
          disabled={topUp.isPending || pending}
          className="bg-foreground text-background hover:bg-foreground/90"
        >
          <Plus aria-hidden strokeWidth={1.75} className="size-[18px]" />
          {topUp.isPending ? 'Recargando...' : topUpLabel(amount)}
        </Button>
      </form>
    </section>
  );
}
