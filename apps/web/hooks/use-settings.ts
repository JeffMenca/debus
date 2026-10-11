import {
  type CreateSettingsRequest,
  type PageQuery,
  type SettingsVersion,
  settingsPageSchema,
  settingsVersionSchema,
} from '@debus/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';

export const SETTINGS_PATH = '/api/administracion/settings';

export function useSettingsPage(query: PageQuery) {
  return useQuery({
    queryKey: ['settings', 'page', query],
    queryFn: () =>
      apiRequest(`${SETTINGS_PATH}?${toQueryString({ ...query })}`, settingsPageSchema),
    placeholderData: keepPreviousData,
  });
}

// The version in force and the next one, whichever page of the history is open.
export function useSettingsSummary() {
  return useQuery({
    queryKey: ['settings', 'summary'],
    queryFn: () =>
      apiRequest(`${SETTINGS_PATH}?${toQueryString({ page: 1, pageSize: 1 })}`, settingsPageSchema),
    select: (page) => page.summary,
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
