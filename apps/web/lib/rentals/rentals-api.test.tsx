import { act, renderHook, waitFor } from '@testing-library/react';
import { queryWrapper } from '../../test-support/query-wrapper';
import { RENTAL_ID, rental, rentalPage } from '../../test-support/rentals';
import {
  useBranchRentals,
  useCancelPaidRental,
  useCancelRental,
  useClientOptions,
  useConfirmRental,
  useMyRentals,
  usePayRental,
  useRegisterCounterRental,
  useRentalEstimate,
  useRequestRental,
} from './rentals-api';

const API = 'http://localhost:4000/api';
const trip = {
  branchId: rental().branchId,
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Panajachel',
  departureAt: '2026-10-24T13:00:00.000Z',
  returnAt: null,
  passengers: 35,
  distanceKm: 92,
};

afterEach(() => jest.restoreAllMocks());

async function mutate<T>(run: () => Promise<T>): Promise<T> {
  let answer: T | undefined;
  await act(async () => {
    answer = await run();
  });
  return answer as T;
}

describe('rental queries', () => {
  it('estimates only a distance that can be priced', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        Response.json({ ratePerKm: 30, estimatedPrice: 2760, effectiveFrom: '2026-10-01' }),
      );
    const { wrapper } = queryWrapper();
    const { result, rerender } = renderHook(({ km }) => useRentalEstimate(km), {
      wrapper,
      initialProps: { km: null as number | null },
    });

    expect(result.current.fetchStatus).toBe('idle');
    rerender({ km: 92 });
    await waitFor(() => expect(result.current.data?.estimatedPrice).toBe(2760));
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/clientes/rentals/estimate?distanceKm=92`,
      expect.anything(),
    );
  });

  it('pages the history of the client and the rentals of the branch', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () => Response.json(rentalPage([rental()])));
    const { wrapper } = queryWrapper();
    const mine = renderHook(() => useMyRentals({ page: 2, pageSize: 20 }), { wrapper });
    const branch = renderHook(
      () => useBranchRentals({ status: 'REQUESTED', q: 'ana', page: 1, pageSize: 20 }),
      { wrapper },
    );

    await waitFor(() => expect(mine.result.current.data?.total).toBe(1));
    await waitFor(() => expect(branch.result.current.data?.total).toBe(1));
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/clientes/rentals/mine?page=2&pageSize=20`,
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/clientes/branch-rentals?page=1&pageSize=20&q=ana&status=REQUESTED`,
      expect.anything(),
    );
  });
});

describe('rental changes', () => {
  it('asks for a rental and refreshes the lists', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(Response.json(rental({ status: 'REQUESTED', price: null })));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useRequestRental(), { wrapper });

    await mutate(() => result.current.mutateAsync(trip));

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/clientes/rentals`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(trip) }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['rentals'] });
  });

  it('pays with the rental id as the key and refreshes the wallet too', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(Response.json(rental({ status: 'PAID', paidOn: '2026-10-21' })));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => usePayRental(), { wrapper });

    await mutate(() => result.current.mutateAsync({ id: RENTAL_ID, paidOn: '2026-10-21' }));

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/clientes/rentals/${RENTAL_ID}/pay`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ paidOn: '2026-10-21' }),
        headers: expect.objectContaining({ 'idempotency-key': RENTAL_ID }),
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['rentals'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['wallet'] });
  });

  it('cancels an unpaid rental in clientes and a paid one in viajes', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(Response.json(rental({ status: 'CANCELLED' })))
      .mockResolvedValueOnce(
        Response.json({
          id: RENTAL_ID,
          branchId: rental().branchId,
          clientName: 'Ana Méndez',
          nit: '45218376',
          originLabel: 'Quetzaltenango',
          destinationLabel: 'Panajachel',
          departureAt: '2026-10-24T13:00:00.000Z',
          returnAt: null,
          passengers: 35,
          distanceKm: 92,
          price: 2500,
          status: 'CANCELLED',
          tripId: null,
        }),
      );
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const unpaid = renderHook(() => useCancelRental(), { wrapper });
    const paid = renderHook(() => useCancelPaidRental(), { wrapper });

    await mutate(() => unpaid.result.current.mutateAsync(RENTAL_ID));
    await mutate(() => paid.result.current.mutateAsync(RENTAL_ID));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${API}/clientes/rentals/${RENTAL_ID}/cancel`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${API}/viajes/rental-requests/${RENTAL_ID}/cancel`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['rental-requests'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trips'] });
  });

  it('shows a cancelled paid rental as such right away, and asks again once clientes has it', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] });
    jest.spyOn(global, 'fetch').mockResolvedValue(
      Response.json({
        id: RENTAL_ID,
        branchId: rental().branchId,
        clientName: 'Ana Méndez',
        nit: '45218376',
        originLabel: 'Quetzaltenango',
        destinationLabel: 'Panajachel',
        departureAt: '2026-10-24T13:00:00.000Z',
        returnAt: null,
        passengers: 35,
        distanceKm: 92,
        price: 2500,
        status: 'CANCELLED',
        tripId: null,
      }),
    );
    const { client, wrapper } = queryWrapper();
    const key = ['rentals', 'branch', { status: 'PAID' }];
    client.setQueryData(key, rentalPage([rental({ status: 'PAID' }), rental({ id: 'otro' })]));
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCancelPaidRental(), { wrapper });

    await mutate(() => result.current.mutateAsync(RENTAL_ID));

    const page = client.getQueryData<ReturnType<typeof rentalPage>>(key);
    expect(page?.items.map((item) => item.status)).toEqual(['CANCELLED', 'CONFIRMED']);
    invalidate.mockClear();
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['rentals'] });
    jest.useRealTimers();
  });

  it('confirms the price and records a walk-in rental for the branch', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () => Response.json(rental({ channel: 'COUNTER' })));
    const { wrapper } = queryWrapper();
    const confirm = renderHook(() => useConfirmRental(), { wrapper });
    const counter = renderHook(() => useRegisterCounterRental(), { wrapper });
    const walkIn = { ...trip, clientId: rental().clientId as string, price: 2600 };

    await mutate(() =>
      confirm.result.current.mutateAsync({ id: RENTAL_ID, request: { price: 2500 } }),
    );
    await mutate(() => counter.result.current.mutateAsync(walkIn));

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/clientes/branch-rentals/${RENTAL_ID}/confirm`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ price: 2500 }) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/clientes/branch-rentals`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(walkIn) }),
    );
  });
});

describe('useClientOptions', () => {
  it('asks for the biggest page and passes the search on', async () => {
    const answer = { userId: rental().clientId, fullName: 'Ana', email: 'a@b.com', nit: null };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () =>
        Response.json({ items: [answer], total: 1, page: 1, pageSize: 100 }),
      );
    const { wrapper } = queryWrapper();

    const { result } = renderHook(() => useClientOptions('ana'), { wrapper });

    await waitFor(() => expect(result.current.data?.items).toEqual([answer]));
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${API}/clientes/clients?pageSize=100&q=ana`);
  });
});
