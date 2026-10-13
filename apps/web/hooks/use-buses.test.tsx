import { renderHook, waitFor } from '@testing-library/react';
import { bus, busPage } from '../test-support/fleet';
import { queryWrapper } from '../test-support/query-wrapper';
import {
  useBusCounts,
  useBusesPage,
  useSaveBus,
  useSetBusActive,
  useUploadBusPhoto,
} from './use-buses';

const API = 'http://localhost:4000/api/flota/buses';
const fields = {
  plate: 'C482BTX',
  brand: 'Volvo',
  model: 'B8R',
  year: 2021,
  capacity: 40,
  mileageKm: 148410,
  operationalStatus: 'AVAILABLE' as const,
  assignedDriverId: null,
};

afterEach(() => jest.restoreAllMocks());

it('asks for the page, status and search of the screen and validates the answer', async () => {
  const page = busPage([bus()], { page: 2, total: 21 });
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(page));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(
    () => useBusesPage({ status: 'IN_WORKSHOP', q: 'volvo', page: 2, pageSize: 20 }),
    { wrapper },
  );

  await waitFor(() => expect(result.current.data).toEqual(page));
  expect(fetchMock).toHaveBeenCalledWith(
    `${API}?page=2&pageSize=20&q=volvo&status=IN_WORKSHOP`,
    expect.anything(),
  );
});

it('fails when the server answers a list instead of a page', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(Response.json([bus()]));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(() => useBusesPage({ status: 'all', page: 1, pageSize: 20 }), {
    wrapper,
  });

  await waitFor(() => expect(result.current.isError).toBe(true));
});

it('counts the buses by status with a single row', async () => {
  const page = busPage([bus()]);
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(page));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(() => useBusCounts(), { wrapper });

  await waitFor(() => expect(result.current.data).toEqual(page.summary.statusCounts));
  expect(fetchMock).toHaveBeenCalledWith(`${API}?page=1&pageSize=1`, expect.anything());
});

describe('useSaveBus', () => {
  it('registers a bus with POST and refreshes buses and drivers', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(bus()));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSaveBus(), { wrapper });

    await expect(result.current.mutateAsync({ fields })).resolves.toEqual(bus());

    expect(fetchMock).toHaveBeenCalledWith(
      API,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(fields) }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['buses'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['drivers'] });
  });

  it('edits a bus with PATCH', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(bus()));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useSaveBus(), { wrapper });

    await result.current.mutateAsync({ id: bus().id, fields });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/${bus().id}`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify(fields) }),
    );
  });
});

it.each([
  [false, 'deactivate'],
  [true, 'reactivate'],
])('sets active=%s through %s and refreshes buses and drivers', async (active, action) => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(null, { status: 204 }));
  const { client, wrapper } = queryWrapper();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useSetBusActive(), { wrapper });

  await result.current.mutateAsync({ id: bus().id, active });

  expect(fetchMock).toHaveBeenCalledWith(
    `${API}/${bus().id}/${action}`,
    expect.objectContaining({ method: 'POST' }),
  );
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['buses'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['drivers'] });
});

it('uploads a photo as multipart and refreshes the buses and their pictures', async () => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(null, { status: 204 }));
  const { client, wrapper } = queryWrapper();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useUploadBusPhoto(), { wrapper });
  const file = new File(['x'], 'bus.jpg', { type: 'image/jpeg' });

  await result.current.mutateAsync({ id: bus().id, file });

  const init = fetchMock.mock.calls[0][1] as RequestInit;
  expect(fetchMock.mock.calls[0][0]).toBe(`${API}/${bus().id}/photo`);
  expect(init.method).toBe('PUT');
  expect((init.body as FormData).get('photo')).toBeInstanceOf(File);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['buses'] });
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['photo', `/api/flota/buses/${bus().id}/photo`],
  });
  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['photo'] });
});
