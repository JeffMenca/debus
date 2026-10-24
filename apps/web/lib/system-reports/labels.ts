import type { ExpenseConcept, IncomeConcept } from '@debus/contracts';

export const INCOME_CONCEPT_LABELS: Record<IncomeConcept, string> = {
  ONLINE_TICKET: 'Boleto en línea',
  COUNTER_TICKET: 'Boleto de ventanilla',
  RENTAL: 'Alquiler',
};

export const EXPENSE_CONCEPT_LABELS: Record<ExpenseConcept, string> = {
  FUEL: 'Combustible',
  DEPRECIATION: 'Depreciación',
  LABOR: 'Mano de obra',
  PART: 'Repuestos',
};

// What a report with a period and a branch says when it has nothing to show, from the narrowest
// filter to none at all.
export interface EmptyMessages {
  period: string;
  branch: string;
  none: string;
}

export const emptyMessageOf = (
  { from, to, branchId }: { from?: string; to?: string; branchId?: string },
  messages: EmptyMessages,
): string => {
  if (from || to) return messages.period;
  return branchId ? messages.branch : messages.none;
};
