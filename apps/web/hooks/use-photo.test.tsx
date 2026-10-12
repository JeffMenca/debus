import { renderHook, waitFor } from '@testing-library/react';
import { queryWrapper } from '../test-support/query-wrapper';
import { usePhoto, useUploadPhoto } from './use-photo';

const PATH = '/api/flota/buses/1/photo';

describe('usePhoto', () => {
  const create = jest.fn();
  const revoke = jest.fn();

  beforeEach(() => {
    create.mockReset().mockImplementation(() => `blob:photo-${create.mock.calls.length}`);
    revoke.mockReset();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
  });
  afterEach(() => jest.restoreAllMocks());

  it('turns the picture into an object URL', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('img', { headers: { 'content-type': 'image/jpeg' } }));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => usePhoto(PATH), { wrapper });

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe('blob:photo-1'));
    expect(fetchMock).toHaveBeenCalledWith(`http://localhost:4000${PATH}`, expect.anything());
  });

  it('releases the object URL when the component goes away', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('img'));
    const { wrapper } = queryWrapper();
    const { result, unmount } = renderHook(() => usePhoto(PATH), { wrapper });
    await waitFor(() => expect(result.current).not.toBeNull());

    unmount();

    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:photo-1'));
  });

  it('asks for nothing without a path', () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => usePhoto(null), { wrapper });

    expect(result.current).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays empty when the picture cannot be read', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        Response.json(
          { statusCode: 404, error: 'Not Found', message: 'Aún no tiene foto.' },
          { status: 404 },
        ),
      );
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => usePhoto(PATH), { wrapper });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('reuses the cached picture for the same path', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () => new Response('img'));
    const { wrapper } = queryWrapper();
    const first = renderHook(() => usePhoto(PATH), { wrapper });
    await waitFor(() => expect(first.result.current).not.toBeNull());
    const second = renderHook(() => usePhoto(PATH), { wrapper });
    await waitFor(() => expect(second.result.current).not.toBeNull());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes only the picture that was uploaded', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const { client, wrapper } = queryWrapper();
    const uploaded = '/api/flota/buses/1/photo';
    const other = '/api/flota/buses/2/photo';
    client.setQueryData(['photo', uploaded], new Blob(['a']));
    client.setQueryData(['photo', other], new Blob(['b']));
    const { result } = renderHook(() => useUploadPhoto('/api/flota/buses', 'buses'), { wrapper });

    await result.current.mutateAsync({ id: '1', file: new File(['x'], 'bus.jpg') });

    expect(client.getQueryState(['photo', uploaded])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['photo', other])?.isInvalidated).toBe(false);
  });
});
