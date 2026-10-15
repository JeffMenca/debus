import { type UpdateProfileRequest, clientProfileSchema } from '@debus/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';

export const PROFILE_PATH = '/api/clientes/profile';
const PROFILE_KEY = ['profile'];

export function useProfile() {
  return useQuery({
    queryKey: PROFILE_KEY,
    queryFn: () => apiRequest(PROFILE_PATH, clientProfileSchema),
  });
}

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateProfileRequest) =>
      apiRequest(PROFILE_PATH, clientProfileSchema, {
        method: 'PUT',
        body: JSON.stringify(request),
      }),
    onSuccess: (saved) => client.setQueryData(PROFILE_KEY, saved),
  });
}
