import { z } from 'zod';
import { isoDateSchema } from '../dates';
import { searchTermSchema } from '../text';
import { pagedDayRangeQuery } from './day-range';
import { BUS_DISPLAY_STATUSES, LICENSE_TYPES } from './fleet';
import { pageQuerySchema } from './pagination';
import { noGroupsSchema, reportPageSchema } from './reports';

export const BRANCH_REPORTS = [
  'branch-buses',
  'branch-drivers',
  'branch-ticket-income',
  'branch-rental-income',
  'branch-depreciation',
  'branch-repair-expenses',
] as const;
export type BranchReport = (typeof BRANCH_REPORTS)[number];

const count = z.number().int().nonnegative();
const amount = z.number().nonnegative();
const busStatus = z.enum(BUS_DISPLAY_STATUSES);
const q = searchTermSchema.optional();

export const branchBusesQuerySchema = z
  .object({ status: z.enum(['all', ...BUS_DISPLAY_STATUSES]).default('all'), q })
  .extend(pageQuerySchema.shape);
export type BranchBusesQuery = z.infer<typeof branchBusesQuerySchema>;
export const branchBusRowSchema = z.object({
  busId: z.uuid(),
  plate: z.string(),
  brand: z.string(),
  model: z.string(),
  capacity: count,
  status: busStatus,
  driverName: z.string().nullable(),
  mileageKm: count,
  completedTrips: count,
});
export type BranchBusRow = z.infer<typeof branchBusRowSchema>;
export const branchBusesPageSchema = reportPageSchema(
  branchBusRowSchema,
  z.object({ buses: count, completedTrips: count }),
  z.object({ status: busStatus, buses: count }),
);
export type BranchBusesPage = z.infer<typeof branchBusesPageSchema>;

export const DRIVER_REPORT_STATUSES = ['all', 'active', 'inactive'] as const;
export const branchDriversQuerySchema = z
  .object({ status: z.enum(DRIVER_REPORT_STATUSES).default('all'), q })
  .extend(pageQuerySchema.shape);
export type BranchDriversQuery = z.infer<typeof branchDriversQuerySchema>;
export const branchDriverRowSchema = z.object({
  driverId: z.uuid(),
  licenseNumber: z.string(),
  fullName: z.string(),
  licenseType: z.enum(LICENSE_TYPES),
  licenseExpiresOn: isoDateSchema,
  active: z.boolean(),
  completedTrips: count,
});
export type BranchDriverRow = z.infer<typeof branchDriverRowSchema>;
export const branchDriversPageSchema = reportPageSchema(
  branchDriverRowSchema,
  z.object({ drivers: count, completedTrips: count }),
  z.object({ active: z.boolean(), drivers: count }),
);
export type BranchDriversPage = z.infer<typeof branchDriversPageSchema>;

export const branchTicketIncomeQuerySchema = pagedDayRangeQuery({
  routeId: z.uuid().optional(),
  busId: z.uuid().optional(),
});
export type BranchTicketIncomeQuery = z.infer<typeof branchTicketIncomeQuerySchema>;
export const branchTicketIncomeRowSchema = z.object({
  tripId: z.uuid(),
  departureAt: z.iso.datetime(),
  routeId: z.uuid(),
  originLabel: z.string(),
  destinationLabel: z.string(),
  busId: z.uuid(),
  busPlate: z.string().nullable(),
  tickets: count,
  onlineTickets: count,
  counterTickets: count,
  income: amount,
});
export type BranchTicketIncomeRow = z.infer<typeof branchTicketIncomeRowSchema>;
export const branchTicketIncomePageSchema = reportPageSchema(
  branchTicketIncomeRowSchema,
  z.object({ trips: count, tickets: count, income: amount }),
  z.object({
    routeId: z.uuid(),
    originLabel: z.string(),
    destinationLabel: z.string(),
    tickets: count,
    income: amount,
  }),
);
export type BranchTicketIncomePage = z.infer<typeof branchTicketIncomePageSchema>;

export const branchRentalIncomeQuerySchema = pagedDayRangeQuery({ q });
export type BranchRentalIncomeQuery = z.infer<typeof branchRentalIncomeQuerySchema>;
export const branchRentalIncomeRowSchema = z.object({
  rentalId: z.uuid(),
  clientName: z.string(),
  nit: z.string(),
  originLabel: z.string(),
  destinationLabel: z.string(),
  departureAt: z.iso.datetime(),
  returnAt: z.iso.datetime().nullable(),
  paidOn: isoDateSchema,
  passengers: count,
  busPlate: z.string().nullable(),
  price: amount,
});
export type BranchRentalIncomeRow = z.infer<typeof branchRentalIncomeRowSchema>;
export const branchRentalIncomePageSchema = reportPageSchema(
  branchRentalIncomeRowSchema,
  z.object({ rentals: count, income: amount }),
  noGroupsSchema,
);
export type BranchRentalIncomePage = z.infer<typeof branchRentalIncomePageSchema>;

export const branchDepreciationQuerySchema = pagedDayRangeQuery({ q });
export type BranchDepreciationQuery = z.infer<typeof branchDepreciationQuerySchema>;
export const branchDepreciationRowSchema = z.object({
  busId: z.uuid(),
  plate: z.string(),
  brand: z.string(),
  model: z.string(),
  completedTrips: count,
  kmTraveled: count,
  appliedPerKm: amount.nullable(),
  accumulated: amount,
});
export type BranchDepreciationRow = z.infer<typeof branchDepreciationRowSchema>;
export const branchDepreciationPageSchema = reportPageSchema(
  branchDepreciationRowSchema,
  z.object({ kmTraveled: count, accumulated: amount, currentPerKm: amount.nullable() }),
  noGroupsSchema,
);
export type BranchDepreciationPage = z.infer<typeof branchDepreciationPageSchema>;

export const repairCategoryShareSchema = z.object({
  categoryId: z.uuid(),
  categoryName: z.string(),
  lines: count,
  amount,
});
export type RepairCategoryShare = z.infer<typeof repairCategoryShareSchema>;
export const branchRepairExpensesQuerySchema = pagedDayRangeQuery({
  busId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
});
export type BranchRepairExpensesQuery = z.infer<typeof branchRepairExpensesQuerySchema>;
export const branchRepairExpenseRowSchema = z.object({
  busId: z.uuid(),
  plate: z.string().nullable(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  expenses: count,
  total: amount,
  categories: z.array(repairCategoryShareSchema),
});
export type BranchRepairExpenseRow = z.infer<typeof branchRepairExpenseRowSchema>;
export const branchRepairExpensesPageSchema = reportPageSchema(
  branchRepairExpenseRowSchema,
  z.object({ buses: count, expenses: count, total: amount }),
  repairCategoryShareSchema,
);
export type BranchRepairExpensesPage = z.infer<typeof branchRepairExpensesPageSchema>;
