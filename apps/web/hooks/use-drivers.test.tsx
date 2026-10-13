import { renderHook, waitFor } from '@testing-library/react';
import { driver, driverPage } from '../test-support/fleet';
import { queryWrapper } from '../test-support/query-wrapper';
import {
  useDriverOptions,
  useDriversPage,
  useExpiringDrivers,
  useSaveDriver,
  useSetDriverActive,
  useUploadDriverPhoto,
} from './use-drivers';

const API = 'http://localhost:4000/api/flota/drivers';
const fields = {
  fullName: 'Julio Pérez',
  email: 'julio@correo.com',
  phone: '55512345',
  licenseNumber: 'A1234567',
  licenseType: 'C' as const,
  licenseExpiresOn: '2027-03-04',
  baseSalary: 150,
};

afterEach(() => jest.restoreAllMocks());

it('asks for the page, status and search of the screen and validates the answer', async () => {
  const page = driverPage([driver()], { page: 2, total: 21 });
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(page));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(
    () => useDriversPage({ status: 'all', q: 'julio', page: 2, pageSize: 20 }),
    { wrapper },
  );

  await waitFor(() => expect(result.current.data).toEqual(page));
  expect(fetchMock).toHaveBeenCalledWith(
    `${API}?page=2&pageSize=20&q=julio&status=all`,
    expect.anything(),
  );
});

it('fails when the server answers a list instead of a page', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(Response.json([driver()]));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(() => useDriversPage({ status: 'active', page: 1, pageSize: 20 }), {
    wrapper,
  });

  await waitFor(() => expect(result.current.isError).toBe(true));
});

it('offers the active drivers, searched on the server, up to 100', async () => {
  const page = driverPage([driver()]);
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(page));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(() => useDriverOptions('jul'), { wrapper });

  await waitFor(() => expect(result.current.data).toEqual(page));
  expect(fetchMock).toHaveBeenCalledWith(
    `${API}?pageSize=100&q=jul&status=active`,
    expect.anything(),
  );
});

it('lists the active drivers whose licence expires within the given days', async () => {
  const page = driverPage([driver()]);
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(page));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(() => useExpiringDrivers(30), { wrapper });

  await waitFor(() => expect(result.current.data).toEqual(page));
  expect(fetchMock).toHaveBeenCalledWith(
    `${API}?expiringWithinDays=30&page=1&pageSize=100&status=active`,
    expect.anything(),
  );
});

describe('useSaveDriver', () => {
  it('registers a driver with POST and refreshes drivers and buses', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(driver()));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSaveDriver(), { wrapper });

    await expect(result.current.mutateAsync({ fields })).resolves.toEqual(driver());

    expect(fetchMock).toHaveBeenCalledWith(
      API,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(fields) }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['drivers'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['buses'] });
  });

  it('edits a driver with PATCH', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(driver()));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useSaveDriver(), { wrapper });

    await result.current.mutateAsync({ id: driver().id, fields });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/${driver().id}`,
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});

it.each([
  [false, 'deactivate'],
  [true, 'reactivate'],
])('sets active=%s through %s', async (active, action) => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(null, { status: 204 }));
  const { client, wrapper } = queryWrapper();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useSetDriverActive(), { wrapper });

  await result.current.mutateAsync({ id: driver().id, active });

  expect(fetchMock).toHaveBeenCalledWith(
    `${API}/${driver().id}/${action}`,
    expect.objectContaining({ method: 'POST' }),
  );
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['drivers'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['buses'] });
});

it('uploads a photo as multipart', async () => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(null, { status: 204 }));
  const { client, wrapper } = queryWrapper();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useUploadDriverPhoto(), { wrapper });

  await result.current.mutateAsync({
    id: driver().id,
    file: new File(['x'], 'julio.png', { type: 'image/png' }),
  });

  expect(fetchMock.mock.calls[0][0]).toBe(`${API}/${driver().id}/photo`);
  expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PUT');
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['photo', `/api/flota/drivers/${driver().id}/photo`],
  });
  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['photo'] });
});
