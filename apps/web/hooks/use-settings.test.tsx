import { renderHook, waitFor } from '@testing-library/react';
import { queryWrapper } from '../test-support/query-wrapper';
import { useCreateSettings, useSettingsPage, useSettingsSummary } from './use-settings';

const version = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  depreciationPerKm: 1.25,
  rentalRatePerKm: 12,
  effectiveFrom: '2026-10-10',
  createdAt: '2026-10-10T15:00:00.000Z',
  createdByName: 'Marta Ruiz',
};
const API = 'http://localhost:4000/api/administracion/settings';

const page = {
  items: [version],
  total: 25,
  page: 2,
  pageSize: 20,
  summary: { current: version, upcoming: null },
};

afterEach(() => jest.restoreAllMocks());

it('loads one page of the history', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(page));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(() => useSettingsPage({ page: 2, pageSize: 20 }), { wrapper });

  await waitFor(() => expect(result.current.data).toEqual(page));
  expect(fetchMock).toHaveBeenCalledWith(`${API}?page=2&pageSize=20`, expect.anything());
});

it('reads the current and upcoming versions with a single row', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(page));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(() => useSettingsSummary(), { wrapper });

  await waitFor(() => expect(result.current.data).toEqual(page.summary));
  expect(fetchMock).toHaveBeenCalledWith(`${API}?page=1&pageSize=1`, expect.anything());
});

it('schedules a version and refreshes the settings', async () => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(Response.json(version, { status: 201 }));
  const { client, wrapper } = queryWrapper();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useCreateSettings(), { wrapper });
  const body = { depreciationPerKm: 1.25, rentalRatePerKm: 12, effectiveFrom: '2026-10-10' };

  await result.current.mutateAsync(body);

  expect(fetchMock).toHaveBeenCalledWith(
    API,
    expect.objectContaining({ method: 'POST', body: JSON.stringify(body) }),
  );
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['settings'] });
});
