import {
  type CreateUserRequest,
  type ManagedUser,
  type UpdateUserRequest,
  acceptedResponseSchema,
  managedUserSchema,
} from '@debus/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest, noContent } from '@/lib/api/client';

export const USERS_PATH = '/api/administracion/users';
const userList = z.array(managedUserSchema);

// The page filters the list itself, so it asks for everyone the session may see.
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiRequest(USERS_PATH, userList),
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
