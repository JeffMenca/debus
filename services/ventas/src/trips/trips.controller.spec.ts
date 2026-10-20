import { TripsController } from './trips.controller';

describe('TripsController', () => {
  const service = {
    list: jest.fn().mockResolvedValue('page'),
    places: jest.fn().mockResolvedValue('places'),
    seatMap: jest.fn(),
  };
  const controller = new TripsController(service as never);

  it('hands the query of the trips on sale to the service', async () => {
    const query = { page: 1, pageSize: 20 };

    await expect(controller.list(query)).resolves.toBe('page');
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('asks the service for the places with trips on sale', async () => {
    await expect(controller.places()).resolves.toBe('places');
  });

  it('hands the trip of the seat map to the service', async () => {
    service.seatMap.mockResolvedValue('map');

    await expect(controller.seatMap('trip')).resolves.toBe('map');
    expect(service.seatMap).toHaveBeenCalledWith('trip');
  });
});
