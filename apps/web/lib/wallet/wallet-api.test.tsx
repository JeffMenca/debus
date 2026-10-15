import { act, renderHook, waitFor } from '@testing-library/react';
import { movement, movementPage, wallet } from '../../test-support/account';
import { queryWrapper } from '../../test-support/query-wrapper';
import { useTopUp, useWallet, useWalletMovements } from './wallet-api';

const API = 'http://localhost:4000/api/clientes/wallet';
const KEY = '3f2e4d1c-8b0a-4f8e-9d6c-5b4a3f2e4d1c';

afterEach(() => jest.restoreAllMocks());

describe('useWallet', () => {
  it('reads the balance of whoever is signed in', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(wallet()));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useWallet(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(wallet()));
    expect(fetchMock).toHaveBeenCalledWith(API, expect.anything());
  });
});

describe('useWalletMovements', () => {
  it('asks the server for the kind and page of the screen', async () => {
    const answer = movementPage([movement()], { total: 41, page: 3 });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(answer));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () => useWalletMovements({ kind: 'TOP_UP', page: 3, pageSize: 20 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual(answer));
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/movements?kind=TOP_UP&page=3&pageSize=20`,
      expect.anything(),
    );
  });
});

describe('useTopUp', () => {
  it('sends the amount and day with the key of this top-up and refreshes the wallet', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(Response.json(wallet({ balance: 440 }), { status: 201 }));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useTopUp(), { wrapper });
    const request = { amount: 100, paidOn: '2026-10-14' };

    await act(async () => {
      await result.current.mutateAsync({ key: KEY, request });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/top-ups`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(request),
        headers: expect.objectContaining({ 'idempotency-key': KEY }),
      }),
    );
    expect(client.getQueryData(['wallet', 'balance'])).toEqual(wallet({ balance: 440 }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['wallet'] });
  });
});
