import { act, renderHook, waitFor } from '@testing-library/react';
import { queryWrapper } from '../../test-support/query-wrapper';
import { availableTrip, availableTripPage, soldTicket } from '../../test-support/tickets';
import { useCounterSale, useCounterTrips } from './counter-api';

const API = 'http://localhost:4000/api/ventas';
const KEY = '3f2e4d1c-8b0a-4f8e-9d6c-5b4a3f2e4d1c';

afterEach(() => jest.restoreAllMocks());

describe('useCounterTrips', () => {
  it('asks for the trips on sale from the branch with the filters of the screen', async () => {
    const answer = availableTripPage([availableTrip()]);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(answer));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () => useCounterTrips({ page: 2, pageSize: 20, from: '2026-10-18', q: 'xela' }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual(answer));
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/counter/trips?from=2026-10-18&page=2&pageSize=20&q=xela`,
      expect.anything(),
    );
  });
});

describe('useCounterSale', () => {
  const request = { tripId: 'trip-1', seats: [9, 10], paidOn: '2026-10-18', nit: 'CF' };

  it('sends the sale with its key and refreshes the seats and the trips', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(Response.json(soldTicket(), { status: 201 }));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCounterSale(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ key: KEY, request });
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API}/counter/tickets`);
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify(request) });
    expect((init!.headers as Record<string, string>)['idempotency-key']).toBe(KEY);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['counter'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['on-sale'] });
  });

  it('keeps the seats as they are when the answer never arrived, so the retry sends the same sale', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('network'));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCounterSale(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ key: KEY, request }).catch(() => undefined);
    });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('refreshes the seats when one was sold in the meantime', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(Response.json({ statusCode: 409, message: 'vendido' }, { status: 409 }));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCounterSale(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ key: KEY, request }).catch(() => undefined);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['counter'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['on-sale'] });
  });
});
