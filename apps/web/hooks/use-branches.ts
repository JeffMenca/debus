import {
  type Branch,
  type BranchWithAdmins,
  type CreateBranchRequest,
  type UpdateBranchRequest,
  branchSchema,
  branchWithAdminsSchema,
} from '@debus/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest, noContent } from '@/lib/api/client';

export const BRANCHES_PATH = '/api/administracion/branches';
// The admin area is for system admins, who are the only ones who receive each branch's admins.
const branchList = z.array(branchWithAdminsSchema);

export function useBranches({ includeInactive }: { includeInactive: boolean }) {
  return useQuery({
    queryKey: ['branches', includeInactive],
    queryFn: () =>
      apiRequest(`${BRANCHES_PATH}${includeInactive ? '?includeInactive=true' : ''}`, branchList),
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
