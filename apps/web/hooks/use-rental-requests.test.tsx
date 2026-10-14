import { act, renderHook, waitFor } from '@testing-library/react';
import { rentalRequest, trip, tripPage } from '../test-support/trips';
import { queryWrapper } from '../test-support/query-wrapper';
import { useAssignRental, useRentalRequestsPage } from './use-rental-requests';

const API = 'http://localhost:4000/api/viajes/rental-requests';

afterEach(() => jest.restoreAllMocks());

describe('useRentalRequestsPage', () => {
  it('asks for the page and search of the screen and validates the answer', async () => {
    const page = tripPage([]) as unknown as { items: unknown[] };
    const answer = { ...page, items: [rentalRequest()], total: 1 };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(answer));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () => useRentalRequestsPage({ status: 'PENDING', q: 'colegio', page: 2, pageSize: 20 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual(answer));
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}?page=2&pageSize=20&q=colegio&status=PENDING`,
      expect.anything(),
    );
  });

  it('fails when the server answers something that is not a page of rentals', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(Response.json([rentalRequest()]));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () => useRentalRequestsPage({ status: 'PENDING', page: 1, pageSize: 20 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useAssignRental', () => {
  const request = {
    busId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    driverId: '0b1f1f2e-5c2d-4a8e-9e51-6f3f7a6f3a11',
    estimatedArrivalAt: '2026-10-24T22:00:00.000Z',
  };

  it('assigns with POST and refreshes the trips and the rentals to assign', async () => {
    const created = trip({ type: 'RENTAL', routeId: null, ticketPrice: null });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(created));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useAssignRental('r1'), { wrapper });

    let assigned: unknown;
    await act(async () => {
      assigned = await result.current.mutateAsync(request);
    });

    expect(assigned).toEqual(created);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/r1/assignment`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(request) }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trips'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['rental-requests'] });
  });

  it('rejects with the service message when it answers 409', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        Response.json(
          { statusCode: 409, message: 'Ese bus ya tiene un viaje en ese horario.' },
          { status: 409 },
        ),
      );
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useAssignRental('r1'), { wrapper });

    await expect(act(() => result.current.mutateAsync(request))).rejects.toMatchObject({
      status: 409,
      message: 'Ese bus ya tiene un viaje en ese horario.',
    });
  });
});
