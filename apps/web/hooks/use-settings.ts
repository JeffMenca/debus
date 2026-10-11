import {
  type CreateSettingsRequest,
  type SettingsVersion,
  settingsOverviewSchema,
  settingsVersionSchema,
} from '@debus/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';

export const SETTINGS_PATH = '/api/administracion/settings';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiRequest(SETTINGS_PATH, settingsOverviewSchema),
  });
}

export function useCreateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSettingsRequest): Promise<SettingsVersion> =>
      apiRequest(SETTINGS_PATH, settingsVersionSchema, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['settings'] }),
  });
}
