import { z } from 'zod';
import { isoDateSchema } from '../dates';
import { REPAIR_LINE_KINDS } from '../events/expense-payloads';
import { EVENT_AMOUNT_MAX } from '../events/limits';
import { searchTermSchema } from '../text';
import { pageQuerySchema, pageSchema, pageWithSummarySchema } from './pagination';

export const EXPENSE_CATEGORY_NAME_MAX = 40;
export const REPAIR_EXPENSE_LINES_MAX = 30;

const categoryName = z.string().trim().min(2).max(EXPENSE_CATEGORY_NAME_MAX);
// Quetzales with at most two decimals, never zero: a line always costs something.
const hasAtMostTwoDecimals = (value: number) =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
const lineAmount = z
  .number()
  .positive()
  .max(EVENT_AMOUNT_MAX)
  .refine(hasAtMostTwoDecimals, { message: 'at most two decimals' });
// RepairExpenseAdded carries the total, so the total has the same ceiling as one amount.
const totalFitsTheEvent = (lines: { amount: number }[]) =>
  lines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0) <= EVENT_AMOUNT_MAX * 100;

export const expenseCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  active: z.boolean(),
  inUse: z.boolean(),
});
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

export const createExpenseCategoryRequestSchema = z.object({ name: categoryName });
export type CreateExpenseCategoryRequest = z.infer<typeof createExpenseCategoryRequestSchema>;

export const updateExpenseCategoryRequestSchema = z
  .object({ name: categoryName.optional(), active: z.boolean().optional() })
  .refine((value) => value.name !== undefined || value.active !== undefined, {
    message: 'change the name or the active flag',
  });
export type UpdateExpenseCategoryRequest = z.infer<typeof updateExpenseCategoryRequestSchema>;

export const expenseCategoryListQuerySchema = z
  .object({
    status: z.enum(['all', 'active', 'inactive']).default('active'),
    q: searchTermSchema.optional(),
  })
  .extend(pageQuerySchema.shape);
export type ExpenseCategoryListQuery = z.infer<typeof expenseCategoryListQuerySchema>;
export const expenseCategoryPageSchema = pageSchema(expenseCategorySchema);
export type ExpenseCategoryPage = z.infer<typeof expenseCategoryPageSchema>;

export const repairExpenseLineRequestSchema = z.object({
  categoryId: z.uuid(),
  kind: z.enum(REPAIR_LINE_KINDS),
  description: z.string().trim().max(200),
  amount: lineAmount,
});

// The web generates `id`: sending the same expense twice returns the first one instead of a copy.
export const createRepairExpenseRequestSchema = z
  .object({
    id: z.uuid(),
    busId: z.uuid(),
    serviceDate: isoDateSchema,
    lines: z.array(repairExpenseLineRequestSchema).min(1).max(REPAIR_EXPENSE_LINES_MAX),
  })
  .refine((value) => totalFitsTheEvent(value.lines), {
    path: ['lines'],
    message: 'the total of the lines is too large',
  });
export type CreateRepairExpenseRequest = z.infer<typeof createRepairExpenseRequestSchema>;

export const repairExpenseSchema = z.object({
  id: z.uuid(),
  branchId: z.uuid(),
  busId: z.uuid(),
  busPlate: z.string(),
  serviceDate: isoDateSchema,
  total: z.number(),
  laborTotal: z.number(),
  partsTotal: z.number(),
  lines: z.array(repairExpenseLineRequestSchema.extend({ categoryName: z.string() })),
});
export type RepairExpense = z.infer<typeof repairExpenseSchema>;

export const repairExpenseListQuerySchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    busId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    q: searchTermSchema.optional(),
  })
  .extend(pageQuerySchema.shape)
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'to must not be before from',
  });
export type RepairExpenseListQuery = z.infer<typeof repairExpenseListQuerySchema>;
export const repairExpensePageSchema = pageWithSummarySchema(
  repairExpenseSchema,
  z.object({ total: z.number() }),
);
export type RepairExpensePage = z.infer<typeof repairExpensePageSchema>;
