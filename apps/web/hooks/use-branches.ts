import {
  type BranchWithAdmins,
  type CreateBranchRequest,
  type BranchListStatus,
  type UpdateBranchRequest,
  MAX_PAGE_SIZE,
  branchSchema,
  branchWithAdminsPageSchema,
  branchWithAdminsSchema,
} from '@debus/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, noContent } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';
import type { BranchListView } from '@/lib/admin/branch-list-params';

export const BRANCHES_PATH = '/api/administracion/branches';

// The admin area is for system admins, who are the only ones who receive each branch's admins.
export function useBranchesPage(query: BranchListView) {
  return useQuery({
    queryKey: ['branches', 'page', query],
    queryFn: () =>
      apiRequest(`${BRANCHES_PATH}?${toQueryString({ ...query })}`, branchWithAdminsPageSchema),
    placeholderData: keepPreviousData,
  });
}

// For the selects: the same list with the largest page. Guatemala has far fewer than 100 branches.
export function useBranchOptions({ status }: { status: BranchListStatus }) {
  return useQuery({
    queryKey: ['branches', 'options', status],
    queryFn: () =>
      apiRequest(
        `${BRANCHES_PATH}?${toQueryString({ pageSize: MAX_PAGE_SIZE, status })}`,
        branchWithAdminsPageSchema,
      ),
    select: (page) => page.items,
  });
}

export function useBranchCounts() {
  return useQuery({
    queryKey: ['branches', 'counts'],
    queryFn: () =>
      apiRequest(
        `${BRANCHES_PATH}?${toQueryString({ page: 1, pageSize: 1 })}`,
        branchWithAdminsPageSchema,
      ),
    select: (page) => page.summary.statusCounts,
  });
}

export function useBranch(id: string | null) {
  return useQuery({
    queryKey: ['branch', id],
    queryFn: () => apiRequest(`${BRANCHES_PATH}/${id}`, branchSchema),
    enabled: Boolean(id),
  });
}

function useInvalidateBranches() {
  const client = useQueryClient();
  return (id?: string) =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['branches'] }),
      id ? client.invalidateQueries({ queryKey: ['branch', id] }) : undefined,
    ]);
}

export function useCreateBranch() {
  const invalidate = useInvalidateBranches();
  return useMutation({
    mutationFn: (body: CreateBranchRequest): Promise<BranchWithAdmins> =>
      apiRequest(BRANCHES_PATH, branchWithAdminsSchema, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateBranch(id: string) {
  const invalidate = useInvalidateBranches();
  return useMutation({
    mutationFn: (body: UpdateBranchRequest): Promise<BranchWithAdmins> =>
      apiRequest(`${BRANCHES_PATH}/${id}`, branchWithAdminsSchema, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidate(id),
  });
}

export function useSetBranchActive() {
  const invalidate = useInvalidateBranches();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiRequest(`${BRANCHES_PATH}/${id}/${active ? 'reactivate' : 'deactivate'}`, noContent, {
        method: 'POST',
      }),
    onSuccess: (_, { id }) => invalidate(id),
  });
}
