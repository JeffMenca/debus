import { renderHook, waitFor } from '@testing-library/react';
import { queryWrapper } from '../test-support/query-wrapper';
import { useSystemRoutesMap } from './use-system-routes-map';

const API = 'http://localhost:4000/api/reportes/reports/system-routes-map';
const BRANCH = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const answer = {
  branches: [
    { id: BRANCH, name: 'Quetzaltenango', latitude: 14.8347, longitude: -91.518, routes: 0 },
  ],
  selectedBranchId: BRANCH,
  routes: [],
};

afterEach(() => jest.restoreAllMocks());

it('asks for the map of the branch and validates the answer', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(answer));
  const { wrapper } = queryWrapper();

  const { result } = renderHook(() => useSystemRoutesMap(BRANCH), { wrapper });

  await waitFor(() => expect(result.current.data).toEqual(answer));
  expect(fetchMock).toHaveBeenCalledWith(`${API}?branchId=${BRANCH}`, expect.anything());
});

it('leaves the choice of branch to the server when there is none', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(answer));
  const { wrapper } = queryWrapper();

  renderHook(() => useSystemRoutesMap(undefined), { wrapper });

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledWith(`${API}?`, expect.anything());
});

it('fails when the map does not match the contract', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ branches: 'many' }));
  const { wrapper } = queryWrapper();

  const { result } = renderHook(() => useSystemRoutesMap(undefined), { wrapper });

  await waitFor(() => expect(result.current.isError).toBe(true));
});
