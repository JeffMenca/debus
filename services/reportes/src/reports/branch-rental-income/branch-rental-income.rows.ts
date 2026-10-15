import type { BranchRentalIncomePage, BranchRentalIncomeRow } from '@debus/contracts';

export type RentalIncomeTotals = BranchRentalIncomePage['summary']['totals'];

export interface RentalIncomeRecord {
  id: string;
  client_name: string;
  nit: string;
  origin_label: string;
  destination_label: string;
  departure_at: Date;
  return_at: Date | null;
  // A DATE column reaches us as midnight UTC of that day.
  paid_on: Date;
  passengers: number;
  bus_plate: string | null;
  price: number;
}
export type RentalIncomeTotalsRecord = RentalIncomeTotals;

export const toRentalIncomeRow = (record: RentalIncomeRecord): BranchRentalIncomeRow => ({
  rentalId: record.id,
  clientName: record.client_name,
  nit: record.nit,
  originLabel: record.origin_label,
  destinationLabel: record.destination_label,
  departureAt: record.departure_at.toISOString(),
  returnAt: record.return_at?.toISOString() ?? null,
  paidOn: record.paid_on.toISOString().slice(0, 10),
  passengers: record.passengers,
  busPlate: record.bus_plate,
  price: record.price,
});

export const toRentalIncomeTotals = (
  record: RentalIncomeTotalsRecord | undefined,
): RentalIncomeTotals => ({
  rentals: record?.rentals ?? 0,
  income: record?.income ?? 0,
});
