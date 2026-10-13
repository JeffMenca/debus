import { renderHook, waitFor } from '@testing-library/react';
import { route, routePage } from '../test-support/fleet';
import { queryWrapper } from '../test-support/query-wrapper';
import { useDeleteRoute, useRoutesPage, useSaveRoute } from './use-routes';

const API = 'http://localhost:4000/api/flota/routes';

afterEach(() => jest.restoreAllMocks());

it('asks for the page, status and search of the screen and validates the answer', async () => {
  const page = routePage([route()]);
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(page));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(
    () => useRoutesPage({ status: 'inactive', q: 'guate', page: 1, pageSize: 20 }),
    { wrapper },
  );

  await waitFor(() => expect(result.current.data).toEqual(page));
  expect(fetchMock).toHaveBeenCalledWith(
    `${API}?page=1&pageSize=20&q=guate&status=inactive`,
    expect.anything(),
  );
});

it('fails when the server answers a list instead of a page', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(Response.json([route()]));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(() => useRoutesPage({ status: 'active', page: 1, pageSize: 20 }), {
    wrapper,
  });

  await waitFor(() => expect(result.current.isError).toBe(true));
});

describe('useSaveRoute', () => {
  it('creates a route with POST and refreshes the routes', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(route()));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSaveRoute(), { wrapper });
    const input = {
      destinationBranchId: route().destinationBranchId,
      distanceKm: 206.5,
      ticketPrice: 85,
    };

    await expect(result.current.mutateAsync({ input })).resolves.toEqual(route());

    expect(fetchMock).toHaveBeenCalledWith(
      API,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['routes'] });
  });

  it('edits a route with PATCH', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(route()));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useSaveRoute(), { wrapper });
    const input = { distanceKm: 210, ticketPrice: 90, active: false };

    await result.current.mutateAsync({ id: route().id, input });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/${route().id}`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify(input) }),
    );
  });
});

it('deletes a route and refreshes the routes', async () => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(null, { status: 204 }));
  const { client, wrapper } = queryWrapper();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useDeleteRoute(), { wrapper });

  await result.current.mutateAsync(route().id);

  expect(fetchMock).toHaveBeenCalledWith(
    `${API}/${route().id}`,
    expect.objectContaining({ method: 'DELETE' }),
  );
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['routes'] });
});
