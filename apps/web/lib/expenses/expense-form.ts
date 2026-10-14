import {
  type CreateRepairExpenseRequest,
  EVENT_AMOUNT_MAX,
  REPAIR_LINE_KINDS,
  repairExpenseLineRequestSchema,
} from '@debus/contracts';
import { z } from 'zod';
import { formatQuetzales } from '@/lib/format';
import { parseMoney } from '@/lib/number-input';

export type LineKind = (typeof REPAIR_LINE_KINDS)[number];

export const LINE_KIND_LABELS: Record<LineKind, string> = {
  LABOR: 'Mano de obra',
  PART: 'Repuesto',
};

// What the person types: the amount stays text until it is validated, and `key` keeps a line's
// place on screen while others are added or removed.
export interface LineValues {
  key: string;
  categoryId: string;
  kind: LineKind;
  description: string;
  amount: string;
}

export interface ExpenseValues {
  busId: string;
  serviceDate: string;
  lines: LineValues[];
}

export const emptyLine = (key: string): LineValues => ({
  key,
  categoryId: '',
  kind: 'LABOR',
  description: '',
  amount: '',
});

const isEmptyLine = (line: LineValues) =>
  !line.categoryId && !line.description.trim() && !line.amount.trim();

// The amount as the service takes it, or null when it is not a valid one.
const amountOf = (line: LineValues): number | null => {
  const amount = parseMoney(line.amount);
  return amount !== null && repairExpenseLineRequestSchema.shape.amount.safeParse(amount).success
    ? amount
    : null;
};

export const EXPENSE_PROBLEMS = {
  busId: 'Elige el bus.',
  serviceDate: 'Elige la fecha del servicio.',
  category: 'Elige la categoría.',
  amount: 'Escribe el monto en quetzales, mayor que cero y con hasta dos decimales.',
  total: `El total del gasto no puede pasar de ${formatQuetzales(EVENT_AMOUNT_MAX)}. Divídelo en varios gastos.`,
} as const;

const lineSchema = z.object({
  key: z.string(),
  categoryId: z.string(),
  kind: z.enum(REPAIR_LINE_KINDS),
  description: z.string(),
  amount: z.string(),
});

const toCents = (amount: number) => Math.round(amount * 100);
const sumInCents = (lines: LineValues[]) =>
  lines.reduce((sum, line) => sum + toCents(amountOf(line) ?? 0), 0);

// Lines left empty are dropped, so only the ones with something typed are checked; when every line
// is empty the first one is marked, so the person sees where to start.
export const expenseFormSchema = z.object({
  busId: z.string().min(1, EXPENSE_PROBLEMS.busId),
  serviceDate: z.string().min(1, EXPENSE_PROBLEMS.serviceDate),
  lines: z.array(lineSchema).superRefine((lines, ctx) => {
    const filled = lines.some((line) => !isEmptyLine(line));
    lines.forEach((line, index) => {
      if (isEmptyLine(line) && (filled || index > 0)) return;
      if (!line.categoryId) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'categoryId'],
          message: EXPENSE_PROBLEMS.category,
        });
      }
      if (amountOf(line) === null) {
        ctx.addIssue({ code: 'custom', path: [index, 'amount'], message: EXPENSE_PROBLEMS.amount });
      }
    });
    if (sumInCents(lines) > EVENT_AMOUNT_MAX * 100) {
      ctx.addIssue({ code: 'custom', path: [], message: EXPENSE_PROBLEMS.total });
    }
  }),
});

export interface ExpenseProblems {
  busId?: string;
  serviceDate?: string;
  // By position in the list of lines.
  lines: Record<number, Partial<Record<'categoryId' | 'amount', string>>>;
  total?: string;
}

// What is wrong with the form, field by field, or null when it can be sent.
export function validateExpense(values: ExpenseValues): ExpenseProblems | null {
  const result = expenseFormSchema.safeParse(values);
  if (result.success) return null;
  const problems: ExpenseProblems = { lines: {} };
  for (const { path, message } of result.error.issues) {
    const [field, index, lineField] = path;
    if (field === 'busId' || field === 'serviceDate') problems[field] = message;
    if (field === 'lines' && index === undefined) problems.total = message;
    if (
      field === 'lines' &&
      typeof index === 'number' &&
      (lineField === 'categoryId' || lineField === 'amount')
    ) {
      problems.lines[index] = { ...problems.lines[index], [lineField]: message };
    }
  }
  return problems;
}

// Only for values that already passed `validateExpense`.
export function toCreateRepairExpenseRequest(
  values: ExpenseValues,
  id: string,
): CreateRepairExpenseRequest {
  return {
    id,
    busId: values.busId,
    serviceDate: values.serviceDate,
    lines: values.lines
      .filter((line) => !isEmptyLine(line))
      .map((line) => ({
        categoryId: line.categoryId,
        kind: line.kind,
        description: line.description.trim(),
        amount: amountOf(line) ?? 0,
      })),
  };
}

// The totals shown while typing; lines that are not a valid amount yet do not count.
export function liveTotals(lines: LineValues[]) {
  let labor = 0;
  let parts = 0;
  for (const line of lines) {
    const amount = amountOf(line);
    if (amount === null) continue;
    if (line.kind === 'LABOR') labor += toCents(amount);
    else parts += toCents(amount);
  }
  return { total: (labor + parts) / 100, laborTotal: labor / 100, partsTotal: parts / 100 };
}
