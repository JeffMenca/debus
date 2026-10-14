import { randomUUID } from 'node:crypto';
import {
  type Bus,
  type ExpenseCategory,
  type RepairExpense,
  createExpenseCategoryRequestSchema,
  createRepairExpenseRequestSchema,
  expenseCategoryListQuerySchema,
  foldSearchText,
  pageArgs,
  repairExpenseListQuerySchema,
  toPage,
  updateExpenseCategoryRequestSchema,
} from '@debus/contracts';
import type { Page, Route as PageRoute } from '@playwright/test';
import type { RecordedRequest } from './admin-gateway';
import { FLEET_BRANCH_ID } from './fleet-gateway';
import { fulfillJson } from './session';

export interface ExpensesSeed {
  categories?: ExpenseCategory[];
  expenses?: RepairExpense[];
  // The buses of the branch, which the service knows from its own copies.
  buses?: Bus[];
  // Categories the list reports as unused although they already have expenses: a list that is stale.
  staleUnused?: string[];
  // The next saves of an expense fail with a 503, as when the service is busy.
  failSaves?: number;
}

const INVALID = 'Revisa los datos marcados e intenta de nuevo.';
// The same texts the administracion service answers with.
export const EXPENSE_MESSAGES = {
  categoryNameTaken: 'Ya existe una categoría con ese nombre.',
  categoryInUse: 'Esta categoría ya tiene gastos. Desactívala para que no se use más.',
  categoryNotFound: 'No encontramos esa categoría.',
  categoryInactive: 'Una de las categorías está desactivada. Elige otra.',
  busNotFound: 'No encontramos ese bus en tu sucursal.',
  busInactive: 'Ese bus está desactivado.',
  expenseNotFound: 'No encontramos ese gasto.',
  upstream: 'El servicio no respondió. Intenta de nuevo en unos segundos.',
} as const;

const toCents = (value: number) => Math.round(value * 100);
const EXPENSE_PATH = /\/api\/administracion\/(expense-categories|repair-expenses)(\/[^/?]+)?(\?|$)/;

// Plays the expense routes of the administracion API with state, like the service: the catalog of
// categories, the repair expenses with the total of the whole filter, and the same status codes and texts.
export async function mockExpensesGateway(page: Page, seed: ExpensesSeed = {}) {
  const categories = structuredClone(seed.categories ?? []);
  const expenses = structuredClone(seed.expenses ?? []);
  const buses = seed.buses ?? [];
  const requests: RecordedRequest[] = [];
  let failures = seed.failSaves ?? 0;

  const error = (route: PageRoute, status: number, message: string) =>
    fulfillJson(route, status, { statusCode: status, message });
  const hasExpenses = (categoryId: string) =>
    expenses.some((expense) => expense.lines.some((line) => line.categoryId === categoryId));
  // What the list reports, which a stale list gets wrong; deleting always checks the expenses.
  const inUse = (category: ExpenseCategory) =>
    !seed.staleUnused?.includes(category.id) && hasExpenses(category.id);
  const taken = (name: string, except?: string) =>
    categories.some((item) => item.id !== except && item.name.toLowerCase() === name.toLowerCase());

  await page.route(EXPENSE_PATH, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return fulfillJson(route, 204);

    const url = new URL(request.url());
    const [, , , resource, id] = url.pathname.split('/');
    const method = request.method();
    const body: unknown = request.postData() ? (request.postDataJSON() as unknown) : undefined;
    requests.push({ method, path: url.pathname, query: url.search, body });

    if (resource === 'expense-categories') {
      if (method === 'GET') {
        const parsed = expenseCategoryListQuerySchema.safeParse(
          Object.fromEntries(url.searchParams),
        );
        if (!parsed.success) return error(route, 400, INVALID);
        const { status, q, ...paging } = parsed.data;
        const shown = categories
          .filter(
            (item) =>
              (status === 'all' || item.active === (status === 'active')) &&
              (!q || foldSearchText(item.name).includes(q)),
          )
          .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        const { skip, take } = pageArgs(paging);
        return fulfillJson(
          route,
          200,
          toPage(
            shown.slice(skip, skip + take).map((item) => ({ ...item, inUse: inUse(item) })),
            shown.length,
            paging,
          ),
        );
      }
      if (method === 'POST') {
        const parsed = createExpenseCategoryRequestSchema.safeParse(body);
        if (!parsed.success) return error(route, 400, INVALID);
        if (taken(parsed.data.name)) return error(route, 409, EXPENSE_MESSAGES.categoryNameTaken);
        const created = { id: randomUUID(), name: parsed.data.name, active: true, inUse: false };
        categories.push(created);
        return fulfillJson(route, 201, created);
      }
      const found = categories.find((item) => item.id === id);
      if (!found) return error(route, 404, EXPENSE_MESSAGES.categoryNotFound);
      if (method === 'PATCH') {
        const parsed = updateExpenseCategoryRequestSchema.safeParse(body);
        if (!parsed.success) return error(route, 400, INVALID);
        if (parsed.data.name && taken(parsed.data.name, found.id)) {
          return error(route, 409, EXPENSE_MESSAGES.categoryNameTaken);
        }
        Object.assign(found, parsed.data);
        return fulfillJson(route, 200, { ...found, inUse: inUse(found) });
      }
      if (method === 'DELETE') {
        if (hasExpenses(found.id)) {
          return error(route, 409, EXPENSE_MESSAGES.categoryInUse);
        }
        categories.splice(categories.indexOf(found), 1);
        return fulfillJson(route, 204);
      }
    }

    if (resource === 'repair-expenses') {
      if (method === 'GET' && !id) {
        const parsed = repairExpenseListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) return error(route, 400, INVALID);
        const { from, to, busId, categoryId, q, ...paging } = parsed.data;
        const shown = expenses
          .filter(
            (expense) =>
              (!from || expense.serviceDate >= from) &&
              (!to || expense.serviceDate <= to) &&
              (!busId || expense.busId === busId) &&
              (!categoryId || expense.lines.some((line) => line.categoryId === categoryId)) &&
              (!q ||
                foldSearchText(
                  `${expense.busPlate} ${expense.lines
                    .map((line) => `${line.categoryName} ${line.description}`)
                    .join(' ')}`,
                ).includes(q)),
          )
          .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate) || a.id.localeCompare(b.id));
        const { skip, take } = pageArgs(paging);
        const total = shown.reduce((sum, expense) => sum + toCents(expense.total), 0) / 100;
        return fulfillJson(route, 200, {
          ...toPage(shown.slice(skip, skip + take), shown.length, paging),
          summary: { total },
        });
      }
      if (method === 'GET') {
        const found = expenses.find((expense) => expense.id === id);
        return found
          ? fulfillJson(route, 200, found)
          : error(route, 404, EXPENSE_MESSAGES.expenseNotFound);
      }
      if (method === 'POST') {
        const parsed = createRepairExpenseRequestSchema.safeParse(body);
        if (!parsed.success) return error(route, 400, INVALID);
        const input = parsed.data;
        // Sending the same expense again answers with the first one.
        const existing = expenses.find((expense) => expense.id === input.id);
        if (existing) return fulfillJson(route, 200, existing);
        if (failures > 0) {
          failures -= 1;
          return error(route, 503, EXPENSE_MESSAGES.upstream);
        }
        const bus = buses.find((item) => item.id === input.busId);
        if (!bus) return error(route, 409, EXPENSE_MESSAGES.busNotFound);
        if (!bus.active) return error(route, 409, EXPENSE_MESSAGES.busInactive);
        const chosen = input.lines.map((line) =>
          categories.find((item) => item.id === line.categoryId),
        );
        if (chosen.some((item) => !item)) {
          return error(route, 409, EXPENSE_MESSAGES.categoryNotFound);
        }
        if (chosen.some((item) => !item?.active)) {
          return error(route, 409, EXPENSE_MESSAGES.categoryInactive);
        }
        const lines = input.lines.map((line, index) => ({
          ...line,
          categoryName: chosen[index]?.name ?? '',
        }));
        const centsOf = (kind: RepairExpense['lines'][number]['kind']) =>
          lines
            .filter((line) => line.kind === kind)
            .reduce((sum, line) => sum + toCents(line.amount), 0);
        const labor = centsOf('LABOR');
        const parts = centsOf('PART');
        const created: RepairExpense = {
          id: input.id,
          branchId: FLEET_BRANCH_ID,
          busId: bus.id,
          busPlate: bus.plate,
          serviceDate: input.serviceDate,
          total: (labor + parts) / 100,
          laborTotal: labor / 100,
          partsTotal: parts / 100,
          lines,
        };
        expenses.push(created);
        return fulfillJson(route, 201, created);
      }
    }
    return error(route, 404, EXPENSE_MESSAGES.expenseNotFound);
  });

  return { requests, categories, expenses };
}

export const sampleCategory = (overrides: Partial<ExpenseCategory> = {}): ExpenseCategory => ({
  id: randomUUID(),
  name: 'Motor',
  active: true,
  inUse: false,
  ...overrides,
});

export const sampleExpense = (
  bus: Pick<Bus, 'id' | 'plate'>,
  category: Pick<ExpenseCategory, 'id' | 'name'>,
  overrides: Partial<RepairExpense> = {},
): RepairExpense => ({
  id: randomUUID(),
  branchId: FLEET_BRANCH_ID,
  busId: bus.id,
  busPlate: bus.plate,
  serviceDate: '2026-10-05',
  total: 1200,
  laborTotal: 1200,
  partsTotal: 0,
  lines: [
    {
      categoryId: category.id,
      categoryName: category.name,
      kind: 'LABOR',
      description: 'Cambio de bomba',
      amount: 1200,
    },
  ],
  ...overrides,
});
