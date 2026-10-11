import {
  type CreateUserRequest,
  type ManagedUser,
  type UpdateUserRequest,
  acceptedResponseSchema,
  managedUserSchema,
  userPageSchema,
} from '@debus/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, noContent } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';
import type { UserListView } from '@/lib/admin/user-list-params';

export const USERS_PATH = '/api/administracion/users';

// The server filters and pages; the previous page stays on screen while the next one arrives.
export function useUsersPage(query: UserListView) {
  return useQuery({
    queryKey: ['users', 'page', query],
    queryFn: () => apiRequest(`${USERS_PATH}?${toQueryString({ ...query })}`, userPageSchema),
    placeholderData: keepPreviousData,
  });
}

// The staff counts come with a one-row page: the summary covers the whole filter, not the page.
export function useUserCounts() {
  return useQuery({
    queryKey: ['users', 'counts'],
    queryFn: () =>
      apiRequest(
        `${USERS_PATH}?${toQueryString({ group: 'staff', page: 1, pageSize: 1 })}`,
        userPageSchema,
      ),
    select: (page) => page.summary.statusCounts,
  });
}

// The admins of each branch show on its row, so users and branches refresh together.
function useInvalidateUsers() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['users'] }),
      client.invalidateQueries({ queryKey: ['branches'] }),
    ]);
}

export function useInviteUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (body: CreateUserRequest): Promise<ManagedUser> =>
      apiRequest(USERS_PATH, managedUserSchema, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserRequest }): Promise<ManagedUser> =>
      apiRequest(`${USERS_PATH}/${id}`, managedUserSchema, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useSetUserActive() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiRequest(`${USERS_PATH}/${id}/${active ? 'reactivate' : 'deactivate'}`, noContent, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });
}

export function useResendInvitation() {
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`${USERS_PATH}/${id}/invitation`, acceptedResponseSchema, { method: 'POST' }),
  });
}
