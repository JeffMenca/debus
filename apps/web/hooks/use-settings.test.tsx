import { renderHook, waitFor } from '@testing-library/react';
import { queryWrapper } from '../test-support/query-wrapper';
import { useCreateSettings, useSettings } from './use-settings';

const version = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  depreciationPerKm: 1.25,
  rentalRatePerKm: 12,
  effectiveFrom: '2026-10-10',
  createdAt: '2026-10-10T15:00:00.000Z',
  createdByName: 'Marta Ruiz',
};
const API = 'http://localhost:4000/api/administracion/settings';

afterEach(() => jest.restoreAllMocks());

it('loads the current settings and their history', async () => {
  const overview = { current: version, versions: [version] };
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(overview));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(() => useSettings(), { wrapper });

  await waitFor(() => expect(result.current.data).toEqual(overview));
  expect(fetchMock).toHaveBeenCalledWith(API, expect.anything());
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
