import { z } from 'zod';
import { isoDateSchema } from '../dates';
import { REPAIR_LINE_KINDS } from '../events/expense-payloads';
import { searchTermSchema } from '../text';
import { pagedDayRangeQuery } from './day-range';
import { pageQuerySchema } from './pagination';
import { noGroupsSchema, reportPageSchema } from './reports';
import { repairCategoryShareSchema } from './branch-reports';

export const SYSTEM_REPORTS = [
  'system-income',
  'system-expenses',
  'system-profit',
  'system-top-routes',
  'system-repair-expenses',
  'system-routes-map',
] as const;
export type SystemReport = (typeof SYSTEM_REPORTS)[number];

export const INCOME_CONCEPTS = ['ONLINE_TICKET', 'COUNTER_TICKET', 'RENTAL'] as const;
export type IncomeConcept = (typeof INCOME_CONCEPTS)[number];
export const EXPENSE_CONCEPTS = ['FUEL', 'DEPRECIATION', 'LABOR', 'PART'] as const;
export type ExpenseConcept = (typeof EXPENSE_CONCEPTS)[number];

const count = z.number().int().nonnegative();
const amount = z.number().nonnegative();
const branchId = z.uuid().optional();
const branchFields = { branchId: z.uuid(), branchName: z.string() };

const branchGroupSchema = z.object({ ...branchFields, entries: count, amount });
export type SystemBranchGroup = z.infer<typeof branchGroupSchema>;

export const systemIncomeQuerySchema = pagedDayRangeQuery({ branchId });
export type SystemIncomeQuery = z.infer<typeof systemIncomeQuerySchema>;
export const systemIncomeRowSchema = z.object({
  id: z.uuid(),
  ...branchFields,
  concept: z.enum(INCOME_CONCEPTS),
  day: isoDateSchema,
  originLabel: z.string(),
  destinationLabel: z.string(),
  clientName: z.string().nullable(),
  quantity: count,
  amount,
});
export type SystemIncomeRow = z.infer<typeof systemIncomeRowSchema>;
export const systemIncomePageSchema = reportPageSchema(
  systemIncomeRowSchema,
  z.object({
    entries: count,
    amount,
    onlineTickets: amount,
    counterTickets: amount,
    rentals: amount,
  }),
  branchGroupSchema,
);
export type SystemIncomePage = z.infer<typeof systemIncomePageSchema>;

export const systemExpensesQuerySchema = pagedDayRangeQuery({ branchId });
export type SystemExpensesQuery = z.infer<typeof systemExpensesQuerySchema>;
export const systemExpenseRowSchema = z.object({
  id: z.string(),
  ...branchFields,
  concept: z.enum(EXPENSE_CONCEPTS),
  day: isoDateSchema,
  busPlate: z.string().nullable(),
  originLabel: z.string().nullable(),
  destinationLabel: z.string().nullable(),
  categoryName: z.string().nullable(),
  description: z.string().nullable(),
  amount,
});
export type SystemExpenseRow = z.infer<typeof systemExpenseRowSchema>;
export const systemExpensesPageSchema = reportPageSchema(
  systemExpenseRowSchema,
  z.object({
    entries: count,
    amount,
    fuel: amount,
    depreciation: amount,
    labor: amount,
    parts: amount,
  }),
  branchGroupSchema,
);
export type SystemExpensesPage = z.infer<typeof systemExpensesPageSchema>;

export const systemProfitQuerySchema = pagedDayRangeQuery({ branchId });
export type SystemProfitQuery = z.infer<typeof systemProfitQuerySchema>;
const profitSums = {
  ticketIncome: amount,
  rentalIncome: amount,
  income: amount,
  fuel: amount,
  labor: amount,
  parts: amount,
  depreciation: amount,
  expenses: amount,
  profit: z.number(),
  margin: z.number().nullable(),
};
export const systemProfitRowSchema = z.object({ ...branchFields, ...profitSums });
export type SystemProfitRow = z.infer<typeof systemProfitRowSchema>;
export const systemProfitPageSchema = reportPageSchema(
  systemProfitRowSchema,
  z.object(profitSums),
  noGroupsSchema,
);
export type SystemProfitPage = z.infer<typeof systemProfitPageSchema>;

export const systemTopRoutesQuerySchema = pagedDayRangeQuery({ branchId });
export type SystemTopRoutesQuery = z.infer<typeof systemTopRoutesQuerySchema>;
export const systemTopRouteRowSchema = z.object({
  position: z.number().int().positive(),
  routeId: z.uuid(),
  branchId: z.uuid(),
  originLabel: z.string(),
  destinationLabel: z.string(),
  distanceKm: amount.nullable(),
  ticketPrice: amount.nullable(),
  active: z.boolean().nullable(),
  trips: count,
  onlineTickets: count,
  counterTickets: count,
  tickets: count,
  income: amount,
  share: z.number().min(0).max(100),
});
export type SystemTopRouteRow = z.infer<typeof systemTopRouteRowSchema>;
export const systemTopRoutesPageSchema = reportPageSchema(
  systemTopRouteRowSchema,
  z.object({ routes: count, trips: count, tickets: count, income: amount }),
  noGroupsSchema,
);
export type SystemTopRoutesPage = z.infer<typeof systemTopRoutesPageSchema>;

export const systemRepairExpensesQuerySchema = pagedDayRangeQuery({
  branchId,
  busId: z.uuid().optional(),
});
export type SystemRepairExpensesQuery = z.infer<typeof systemRepairExpensesQuerySchema>;
export const systemRepairExpenseRowSchema = z.object({
  expenseId: z.uuid(),
  lineNo: count,
  categoryId: z.uuid(),
  categoryName: z.string(),
  busId: z.uuid(),
  busPlate: z.string().nullable(),
  ...branchFields,
  serviceDate: isoDateSchema,
  kind: z.enum(REPAIR_LINE_KINDS),
  description: z.string(),
  amount,
});
export type SystemRepairExpenseRow = z.infer<typeof systemRepairExpenseRowSchema>;
export const systemRepairExpensesPageSchema = reportPageSchema(
  systemRepairExpenseRowSchema,
  z.object({ lines: count, expenses: count, amount }),
  repairCategoryShareSchema,
);
export type SystemRepairExpensesPage = z.infer<typeof systemRepairExpensesPageSchema>;

export const systemBusOptionsQuerySchema = z
  .object({ branchId, q: searchTermSchema.optional() })
  .extend(pageQuerySchema.shape);
export type SystemBusOptionsQuery = z.infer<typeof systemBusOptionsQuerySchema>;
export const systemBusOptionRowSchema = z.object({
  id: z.uuid(),
  plate: z.string(),
  brand: z.string(),
  model: z.string(),
  branchName: z.string(),
});
export type SystemBusOptionRow = z.infer<typeof systemBusOptionRowSchema>;
export const systemBusOptionsPageSchema = reportPageSchema(
  systemBusOptionRowSchema,
  z.object({ buses: count }),
  noGroupsSchema,
);
export type SystemBusOptionsPage = z.infer<typeof systemBusOptionsPageSchema>;

// Not paged: at most one route per origin-destination pair, and the map needs every branch.
export const systemRoutesMapQuerySchema = z.object({ branchId });
export type SystemRoutesMapQuery = z.infer<typeof systemRoutesMapQuerySchema>;
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
export const systemMapBranchSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  latitude,
  longitude,
  routes: count,
});
export type SystemMapBranch = z.infer<typeof systemMapBranchSchema>;
export const systemMapRouteSchema = z.object({
  routeId: z.uuid(),
  destinationBranchId: z.uuid(),
  destinationName: z.string(),
  latitude,
  longitude,
  distanceKm: amount,
  ticketPrice: amount,
  tickets: count,
});
export type SystemMapRoute = z.infer<typeof systemMapRouteSchema>;
export const systemRoutesMapSchema = z.object({
  branches: z.array(systemMapBranchSchema),
  selectedBranchId: z.uuid().nullable(),
  routes: z.array(systemMapRouteSchema),
});
export type SystemRoutesMap = z.infer<typeof systemRoutesMapSchema>;
