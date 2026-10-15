import { moneySchema } from '@debus/contracts';
import { formatQuetzales } from '@/lib/format';
import { parseMoney } from '@/lib/number-input';

export const TOP_UP_PRESETS = [50, 100, 200, 500] as const;
export const DEFAULT_TOP_UP = 100;

// The same limits the API applies, so the button only works for an amount it will accept.
export function parseTopUpAmount(text: string): number | null {
  const amount = parseMoney(text);
  return amount !== null && moneySchema.safeParse(amount).success ? amount : null;
}

export const topUpLabel = (amount: number | null): string =>
  amount === null ? 'Recargar' : `Recargar ${formatQuetzales(amount)}`;
