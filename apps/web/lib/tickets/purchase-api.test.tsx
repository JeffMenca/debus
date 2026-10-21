import { act, renderHook, waitFor } from '@testing-library/react';
import { queryWrapper } from '../../test-support/query-wrapper';
import { TICKET_ID, purchase } from '../../test-support/tickets';
import { PURCHASE_POLL_MS } from './purchase';
import { usePurchase, usePurchaseTicket } from './purchase-api';

const API = 'http://localhost:4000/api/ventas';
const KEY = '3f2e4d1c-8b0a-4f8e-9d6c-5b4a3f2e4d1c';
const request = { tripId: 'trip-1', seats: [9, 10], paidOn: '2026-10-20' };
const refreshed = (invalidate: jest.SpyInstance) =>
  invalidate.mock.calls.map(([filters]) => (filters as { queryKey: string[] }).queryKey);

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('usePurchaseTicket', () => {
  async function buy(answer: () => Promise<Response>) {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(answer);
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => usePurchaseTicket(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ key: KEY, request }).catch(() => undefined);
    });
    return { fetchMock, invalidate, result };
  }

  it('pays with the key of the new ticket and refreshes the wallet, the tickets and the seats', async () => {
    const { fetchMock, invalidate, result } = await buy(async () =>
      Response.json(purchase('CONFIRMED'), { status: 201 }),
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API}/purchases`);
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify(request) });
    expect((init!.headers as Record<string, string>)['idempotency-key']).toBe(KEY);
    await waitFor(() => expect(result.current.data?.status).toBe('CONFIRMED'));
    expect(refreshed(invalidate)).toEqual([['wallet'], ['my-tickets'], ['on-sale']]);
  });

  it('refreshes nothing while the payment is still being confirmed', async () => {
    const { invalidate, result } = await buy(async () =>
      Response.json(purchase('PENDING'), { status: 202 }),
    );

    await waitFor(() => expect(result.current.data?.status).toBe('PENDING'));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('refreshes the seats and the wallet when the server refuses the purchase', async () => {
    for (const status of [409, 422]) {
      const { invalidate } = await buy(async () =>
        Response.json({ statusCode: status, message: 'no' }, { status }),
      );

      expect(refreshed(invalidate)).toEqual([['wallet'], ['on-sale']]);
      jest.restoreAllMocks();
    }
  });

  it('leaves everything as it was when nothing was charged or the answer never arrived', async () => {
    const unavailable = await buy(async () =>
      Response.json({ statusCode: 503, message: 'sin cobro' }, { status: 503 }),
    );
    expect(unavailable.invalidate).not.toHaveBeenCalled();
    jest.restoreAllMocks();

    const lost = await buy(async () => {
      throw new TypeError('network');
    });
    expect(lost.invalidate).not.toHaveBeenCalled();
  });
});

describe('usePurchase', () => {
  it('asks about a pending purchase every few seconds until it is settled, then refreshes', async () => {
    jest.useFakeTimers();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(Response.json(purchase('PENDING')))
      .mockResolvedValueOnce(Response.json(purchase('CONFIRMED')));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => usePurchase(purchase('PENDING'), true), { wrapper });

    expect(result.current.data?.status).toBe('PENDING');
    await act(() => jest.advanceTimersByTimeAsync(PURCHASE_POLL_MS));
    await act(() => jest.advanceTimersByTimeAsync(PURCHASE_POLL_MS));
    await act(() => jest.advanceTimersByTimeAsync(PURCHASE_POLL_MS));

    expect(result.current.data?.status).toBe('CONFIRMED');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(`${API}/purchases/${TICKET_ID}`, expect.anything());
    expect(refreshed(invalidate)).toEqual([['wallet'], ['my-tickets'], ['on-sale']]);
  });

  it('stops asking when told to', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.spyOn(global, 'fetch');
    const { wrapper } = queryWrapper();
    renderHook(() => usePurchase(purchase('PENDING'), false), { wrapper });

    await act(() => jest.advanceTimersByTimeAsync(PURCHASE_POLL_MS * 3));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks for nothing without a pending purchase', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => usePurchase(null, true), { wrapper });

    expect(result.current.data).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
