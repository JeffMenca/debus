import { act, renderHook, waitFor } from '@testing-library/react';
import { profile } from '../../test-support/account';
import { queryWrapper } from '../../test-support/query-wrapper';
import { useProfile, useUpdateProfile } from './profile-api';

const API = 'http://localhost:4000/api/clientes/profile';

afterEach(() => jest.restoreAllMocks());

describe('profile API', () => {
  it('reads the profile of whoever is signed in', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(profile()));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useProfile(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(profile()));
    expect(fetchMock).toHaveBeenCalledWith(API, expect.anything());
  });

  it('saves the edited profile and shows the saved one at once', async () => {
    const saved = profile({ nit: '1234567K' });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(saved));
    const { client, wrapper } = queryWrapper();
    const { result } = renderHook(() => useUpdateProfile(), { wrapper });
    const request = { dpi: '2734519200901', phone: '55123489', nit: '1234567K' };

    await act(async () => {
      await result.current.mutateAsync(request);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      API,
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(request) }),
    );
    expect(client.getQueryData(['profile'])).toEqual(saved);
  });
});
