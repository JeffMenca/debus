import { FleetClient } from './fleet-client';

const query = {
  branchId: '9b2c7a10-1111-4c4c-8888-123456789abc',
  busId: '1f0e2d3c-4b5a-4968-8776-655443322110',
  driverId: '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  departureAt: '2026-10-20T12:00:00.000Z',
  estimatedArrivalAt: '2026-10-20T16:00:00.000Z',
};

describe('FleetClient', () => {
  it('asks flota for the availability of the bus and the driver, with the correlation id', async () => {
    const answer = { bus: { available: true }, driver: { available: true } };
    const http = { get: jest.fn().mockResolvedValue(answer) };

    const result = await new FleetClient(http as never).availability(query, 'c1');

    expect(result).toBe(answer);
    const [service, path, , options] = http.get.mock.calls[0];
    expect(service).toBe('flota');
    expect(path.startsWith('/internal/availability?')).toBe(true);
    expect(new URLSearchParams(path.split('?')[1]).get('busId')).toBe(query.busId);
    expect(new URLSearchParams(path.split('?')[1]).get('departureAt')).toBe(query.departureAt);
    expect(options).toEqual({ correlationId: 'c1' });
  });

  it('leaves out what is not set', async () => {
    const http = { get: jest.fn().mockResolvedValue({}) };

    await new FleetClient(http as never).availability({ ...query, ignoreTripId: undefined });

    expect(http.get.mock.calls[0][1]).not.toContain('ignoreTripId');
  });
});
