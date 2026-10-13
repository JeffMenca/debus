import { renderHook, waitFor } from '@testing-library/react';
import { trip, tripPage } from '../test-support/trips';
import { queryWrapper } from '../test-support/query-wrapper';
import { useScheduleTrip, useTripsPage } from './use-trips';

const API = 'http://localhost:4000/api/viajes/trips';

afterEach(() => jest.restoreAllMocks());

it('asks for the days, state, search and page of the screen and validates the answer', async () => {
  const page = tripPage([trip()]);
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(page));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(
    () =>
      useTripsPage({
        from: '2026-10-20',
        to: '2026-10-21',
        status: 'SCHEDULED',
        q: 'xela',
        page: 2,
        pageSize: 50,
      }),
    { wrapper },
  );

  await waitFor(() => expect(result.current.data).toEqual(page));
  expect(fetchMock).toHaveBeenCalledWith(
    `${API}?from=2026-10-20&page=2&pageSize=50&q=xela&status=SCHEDULED&to=2026-10-21`,
    expect.anything(),
  );
});

it('asks for the trips of every day when no day is given', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(tripPage([])));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(
    () => useTripsPage({ status: 'IN_TRANSIT', page: 1, pageSize: 100 }),
    { wrapper },
  );

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(fetchMock).toHaveBeenCalledWith(
    `${API}?page=1&pageSize=100&status=IN_TRANSIT`,
    expect.anything(),
  );
});

it('fails when the server answers something that is not a page of trips', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(Response.json([trip()]));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(
    () => useTripsPage({ from: '2026-10-20', status: 'all', page: 1, pageSize: 20 }),
    { wrapper },
  );

  await waitFor(() => expect(result.current.isError).toBe(true));
});

describe('useScheduleTrip', () => {
  const request = {
    routeId: trip().routeId!,
    busId: trip().busId,
    driverId: trip().driverId,
    departureAt: trip().departureAt,
    estimatedArrivalAt: trip().estimatedArrivalAt,
  };

  it('schedules with POST and refreshes the trips', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(trip()));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useScheduleTrip(), { wrapper });

    await expect(result.current.mutateAsync(request)).resolves.toEqual(trip());

    expect(fetchMock).toHaveBeenCalledWith(
      API,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(request) }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trips'] });
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
    const { result } = renderHook(() => useScheduleTrip(), { wrapper });

    await expect(result.current.mutateAsync(request)).rejects.toMatchObject({
      status: 409,
      message: 'Ese bus ya tiene un viaje en ese horario.',
    });
  });
});
