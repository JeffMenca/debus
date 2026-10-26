import { renderHook, waitFor } from '@testing-library/react';
import { queryWrapper } from '../test-support/query-wrapper';
import { useSystemBusOptions } from './use-system-bus-options';

const API = 'http://localhost:4000/api/reportes/reports/system-bus-options';
const BRANCH = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const answer = {
  items: [
    {
      id: '6e5f4a3b-9c8d-4e7f-8a0b-2c3d4e5f6a7b',
      plate: 'C482BTX',
      brand: 'Volvo',
      model: 'B8R',
      branchName: 'Cobán',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 100,
  summary: { totals: { buses: 1 }, groups: [] },
};

afterEach(() => jest.restoreAllMocks());

it('asks for the largest page of buses of every branch, with the branch and the search of the screen', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(answer));
  const { wrapper } = queryWrapper();

  const { result } = renderHook(() => useSystemBusOptions({ branchId: BRANCH, q: 'volvo' }), {
    wrapper,
  });

  await waitFor(() => expect(result.current.data).toEqual(answer));
  expect(fetchMock).toHaveBeenCalledWith(
    `${API}?branchId=${BRANCH}&page=1&pageSize=100&q=volvo`,
    expect.anything(),
  );
});

it('asks for every bus when nothing narrows the list', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(answer));
  const { wrapper } = queryWrapper();

  renderHook(() => useSystemBusOptions({}), { wrapper });

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledWith(`${API}?page=1&pageSize=100`, expect.anything());
});

it('fails when the answer is not a page of buses', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ items: [{ id: 1 }] }));
  const { wrapper } = queryWrapper();

  const { result } = renderHook(() => useSystemBusOptions({}), { wrapper });

  await waitFor(() => expect(result.current.isError).toBe(true));
});
