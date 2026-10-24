import type { IncomeConcept, SystemIncomePage, SystemIncomeRow } from '@debus/contracts';

export type IncomeTotals = SystemIncomePage['summary']['totals'];
export type IncomeGroup = SystemIncomePage['summary']['groups'][number];

export interface IncomeRecord {
  id: string;
  branch_id: string;
  branch_name: string;
  // ONLINE and COUNTER come from the ticket sales; a rental is RENTAL.
  channel: string;
  // A DATE column reaches us as midnight UTC of that day.
  day: Date;
  origin_label: string;
  destination_label: string;
  client_name: string | null;
  quantity: number;
  amount: number;
}
export interface IncomeTotalsRecord {
  entries: number;
  amount: number;
  online_tickets: number;
  counter_tickets: number;
  rentals: number;
}

export const INCOME_CONCEPT_LABELS: Record<IncomeConcept, string> = {
  ONLINE_TICKET: 'Boleto en línea',
  COUNTER_TICKET: 'Boleto de ventanilla',
  RENTAL: 'Alquiler',
};

const CONCEPT_OF_CHANNEL: Record<string, IncomeConcept> = {
  ONLINE: 'ONLINE_TICKET',
  COUNTER: 'COUNTER_TICKET',
  RENTAL: 'RENTAL',
};

export function incomeConceptOf(channel: string): IncomeConcept {
  const concept = CONCEPT_OF_CHANNEL[channel];
  if (!concept) throw new Error(`Unknown income channel ${channel}`);
  return concept;
}

// The en dash exists in the standard PDF font; the web screen draws its own arrow.
const routeOf = (row: SystemIncomeRow): string => `${row.originLabel} – ${row.destinationLabel}`;

export const incomeDetail = (row: SystemIncomeRow): string =>
  row.clientName ? `${row.clientName} · ${routeOf(row)}` : routeOf(row);

export const toIncomeRow = (record: IncomeRecord): SystemIncomeRow => ({
  id: record.id,
  branchId: record.branch_id,
  branchName: record.branch_name,
  concept: incomeConceptOf(record.channel),
  day: record.day.toISOString().slice(0, 10),
  originLabel: record.origin_label,
  destinationLabel: record.destination_label,
  clientName: record.client_name,
  quantity: record.quantity,
  amount: record.amount,
});

export const toIncomeTotals = (record: IncomeTotalsRecord | undefined): IncomeTotals => ({
  entries: record?.entries ?? 0,
  amount: record?.amount ?? 0,
  onlineTickets: record?.online_tickets ?? 0,
  counterTickets: record?.counter_tickets ?? 0,
  rentals: record?.rentals ?? 0,
});
