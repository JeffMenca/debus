import { renderHook, waitFor } from '@testing-library/react';
import { queryWrapper } from '../../test-support/query-wrapper';
import { availableTrip, availableTripPage, seatMap } from '../../test-support/tickets';
import { useSeatMap, useTripPlaces, useTripsOnSale } from './trips-api';

const API = 'http://localhost:4000/api/ventas';

afterEach(() => jest.restoreAllMocks());

describe('useTripsOnSale', () => {
  it('asks the server for the whole day, the places and the room for the passengers', async () => {
    const answer = availableTripPage([availableTrip()]);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(answer));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () =>
        useTripsOnSale({
          origin: 'Quetzaltenango',
          destination: 'Ciudad de Guatemala',
          date: '2026-10-25',
          passengers: 2,
          page: 2,
          pageSize: 20,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual(answer));
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/trips?destination=Ciudad+de+Guatemala&from=2026-10-25&origin=Quetzaltenango&page=2&pageSize=20&seats=2&to=2026-10-25`,
      expect.anything(),
    );
  });
});

describe('useTripPlaces', () => {
  it('reads where the trips on sale leave from and go to', async () => {
    const places = { origins: ['Quetzaltenango'], destinations: ['Flores'] };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(places));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useTripPlaces(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(places));
    expect(fetchMock).toHaveBeenCalledWith(`${API}/trips/places`, expect.anything());
  });
});

describe('useSeatMap', () => {
  it('reads the seats of the trip', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(seatMap()));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useSeatMap('trip-1'), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(seatMap()));
    expect(fetchMock).toHaveBeenCalledWith(`${API}/trips/trip-1/seats`, expect.anything());
  });

  it('asks for nothing without a trip', () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const { wrapper } = queryWrapper();
    renderHook(() => useSeatMap(null), { wrapper });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
