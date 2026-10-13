import { z } from 'zod';
import { isoDateSchema } from '../dates';

export const REPAIR_LINE_KINDS = ['LABOR', 'PART'] as const;
const amount = z.number().positive().max(1_000_000);
const cents = (value: number) => Math.round(value * 100);

export const repairExpenseAddedPayloadSchema = z
  .object({
    expenseId: z.uuid(),
    branchId: z.uuid(),
    busId: z.uuid(),
    serviceDate: isoDateSchema,
    total: amount,
    lines: z
      .array(
        z.object({
          categoryId: z.uuid(),
          categoryName: z.string().min(1),
          kind: z.enum(REPAIR_LINE_KINDS),
          description: z.string().max(200),
          amount,
        }),
      )
      .min(1),
  })
  .refine(
    (value) =>
      cents(value.total) === value.lines.reduce((sum, line) => sum + cents(line.amount), 0),
    { path: ['total'], message: 'total must be the sum of the lines' },
  );
export type RepairExpenseAddedPayload = z.infer<typeof repairExpenseAddedPayloadSchema>;
