import { act, renderHook, waitFor } from '@testing-library/react';
import { arrivalRecord, departureRecord, tripDetail } from '../test-support/trips';
import { queryWrapper } from '../test-support/query-wrapper';
import { useDeleteTrip, useRecordArrival, useRecordDeparture, useTrip } from './use-trip';

const API = 'http://localhost:4000/api/viajes/trips';
const detail = tripDetail();

afterEach(() => jest.restoreAllMocks());

describe('useTrip', () => {
  it('asks for the trip by id and validates the answer', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(detail));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useTrip(detail.id), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(detail));
    expect(fetchMock).toHaveBeenCalledWith(`${API}/${detail.id}`, expect.anything());
  });

  it('fails when the answer is not a trip detail', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ id: 'x' }));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useTrip(detail.id), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('recording the departure and the arrival', () => {
  const departed = tripDetail({ status: 'IN_TRANSIT', departure: departureRecord() });

  it('posts the departure, keeps the answer as the detail and refreshes the lists', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(departed));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useRecordDeparture(detail.id), { wrapper });
    const request = { departedAt: '2026-10-20T11:34:00.000Z', startMileageKm: 148410 };

    await act(() => result.current.mutateAsync(request));

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/${detail.id}/departure`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(request) }),
    );
    expect(client.getQueryData(['trips', 'detail', detail.id])).toEqual(departed);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trips'] });
  });

  it('posts the arrival to its own address', async () => {
    const completed = tripDetail({
      status: 'COMPLETED',
      departure: departureRecord(),
      arrival: arrivalRecord(),
    });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(completed));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useRecordArrival(detail.id), { wrapper });
    const request = { arrivedAt: '2026-10-20T15:52:00.000Z', endMileageKm: 148614, fuelCost: 1180 };

    await expect(act(() => result.current.mutateAsync(request))).resolves.toEqual(completed);

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/${detail.id}/arrival`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(request) }),
    );
  });

  it('rejects with the service message when it answers 409', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        Response.json({ statusCode: 409, message: 'Ese viaje ya salió.' }, { status: 409 }),
      );
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useRecordDeparture(detail.id), { wrapper });

    await expect(
      act(() =>
        result.current.mutateAsync({ departedAt: '2026-10-20T11:34:00.000Z', startMileageKm: 1 }),
      ),
    ).rejects.toMatchObject({ status: 409, message: 'Ese viaje ya salió.' });
  });
});

describe('useDeleteTrip', () => {
  it('deletes, forgets the detail and refreshes trips and rentals to assign', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const { client, wrapper } = queryWrapper();
    client.setQueryData(['trips', 'detail', detail.id], detail);
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteTrip(), { wrapper });

    await act(() => result.current.mutateAsync(detail.id));

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/${detail.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(client.getQueryData(['trips', 'detail', detail.id])).toBeUndefined();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trips'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['rental-requests'] });
  });
});
