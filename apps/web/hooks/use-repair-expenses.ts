import {
  type CreateRepairExpenseRequest,
  type RepairExpense,
  repairExpensePageSchema,
  repairExpenseSchema,
} from '@debus/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';
import type { ExpenseListView } from '@/lib/expenses/expense-list-params';

export const REPAIR_EXPENSES_PATH = '/api/administracion/repair-expenses';

// The server filters, pages and adds up the total of the whole filter; the previous page stays
// on screen while the next one arrives.
export function useRepairExpensesPage(query: ExpenseListView) {
  return useQuery({
    queryKey: ['repair-expenses', 'page', query],
    queryFn: () =>
      apiRequest(`${REPAIR_EXPENSES_PATH}?${toQueryString({ ...query })}`, repairExpensePageSchema),
    placeholderData: keepPreviousData,
  });
}

// The expense carries the id the form generated: sending it twice answers with the first one.
export function useCreateRepairExpense() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateRepairExpenseRequest): Promise<RepairExpense> =>
      apiRequest(REPAIR_EXPENSES_PATH, repairExpenseSchema, {
        method: 'POST',
        body: JSON.stringify(request),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['repair-expenses'] }),
  });
}
