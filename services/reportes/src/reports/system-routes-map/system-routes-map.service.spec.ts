import { SystemRoutesMapService } from './system-routes-map.service';

const origin = {
  id: '9b2c7a10-1111-4c4c-8888-123456789abc',
  name: 'Quetzaltenango',
  latitude: 14.8347,
  longitude: -91.5181,
  routes: 1,
};
const empty = {
  id: '5d1f3a20-2222-4d4d-9999-123456789abc',
  name: 'Zacapa',
  latitude: 14.97,
  longitude: -89.53,
  routes: 0,
};
const route = {
  route_id: '3b2c1d0e-6f5a-4b4c-9d8e-7f6a5b4c3d2e',
  destination_branch_id: empty.id,
  destination_name: 'Zacapa',
  latitude: 14.97,
  longitude: -89.53,
  distance_km: 201.5,
  ticket_price: 85,
  tickets: 12,
};

describe('SystemRoutesMapService', () => {
  const setup = (answers: unknown[][]) => {
    const queryRaw = jest.fn();
    for (const answer of answers) queryRaw.mockResolvedValueOnce(answer);
    const render = jest.fn().mockResolvedValue(Buffer.from('%PDF-'));
    const service = new SystemRoutesMapService(
      { $queryRaw: queryRaw } as never,
      {
        render,
      } as never,
    );
    return { service, queryRaw, render };
  };

  it('draws the routes of the first branch with active routes when none is chosen', async () => {
    const { service, queryRaw } = setup([[empty, origin], [route]]);

    const map = await service.map({});

    expect(map.selectedBranchId).toBe(origin.id);
    expect(map.branches.map((branch) => [branch.name, branch.routes])).toEqual([
      ['Zacapa', 0],
      ['Quetzaltenango', 1],
    ]);
    expect(map.routes).toEqual([
      {
        routeId: route.route_id,
        destinationBranchId: empty.id,
        destinationName: 'Zacapa',
        latitude: 14.97,
        longitude: -89.53,
        distanceKm: 201.5,
        ticketPrice: 85,
        tickets: 12,
      },
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('answers a chosen branch without routes with an empty list', async () => {
    const { service } = setup([[empty, origin], []]);

    const map = await service.map({ branchId: empty.id });

    expect(map.selectedBranchId).toBe(empty.id);
    expect(map.routes).toEqual([]);
  });

  it('does not read any route when no branch has active routes', async () => {
    const { service, queryRaw } = setup([[empty]]);

    const map = await service.map({});

    expect(map).toEqual({
      branches: [expect.objectContaining({ id: empty.id })],
      selectedBranchId: null,
      routes: [],
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('renders the table of the chosen branch', async () => {
    const { service, render } = setup([[empty, origin], [route]]);

    const buffer = await service.pdf({ branchId: origin.id });

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'Sucursal de origen: Quetzaltenango' }),
    );
  });
});
