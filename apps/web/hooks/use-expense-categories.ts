import {
  type CreateExpenseCategoryRequest,
  type ExpenseCategory,
  type UpdateExpenseCategoryRequest,
  expenseCategoryPageSchema,
  expenseCategorySchema,
} from '@debus/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, noContent } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';
import type { CategoryListView } from '@/lib/expenses/category-list-params';

export const EXPENSE_CATEGORIES_PATH = '/api/administracion/expense-categories';
const KEY = ['expense-categories'] as const;

// The server filters and pages; the previous page stays on screen while the next one arrives.
export function useExpenseCategoriesPage(query: CategoryListView) {
  return useQuery({
    queryKey: [...KEY, 'page', query],
    queryFn: () =>
      apiRequest(
        `${EXPENSE_CATEGORIES_PATH}?${toQueryString({ ...query })}`,
        expenseCategoryPageSchema,
      ),
    placeholderData: keepPreviousData,
  });
}

// One mutation for the three things a category lets you change: create, rename, (de)activate.
export function useSaveExpenseCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      request,
    }:
      | { id?: undefined; request: CreateExpenseCategoryRequest }
      | { id: string; request: UpdateExpenseCategoryRequest }): Promise<ExpenseCategory> =>
      apiRequest(
        id ? `${EXPENSE_CATEGORIES_PATH}/${id}` : EXPENSE_CATEGORIES_PATH,
        expenseCategorySchema,
        {
          method: id ? 'PATCH' : 'POST',
          body: JSON.stringify(request),
        },
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteExpenseCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`${EXPENSE_CATEGORIES_PATH}/${id}`, noContent, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });
}
