import { SystemBusOptionsService } from './system-bus-options.service';

const bus = {
  id: '1f0e2d3c-4b5a-4968-8776-655443322110',
  plate: 'C482BTX',
  brand: 'Volvo',
  model: 'B8R',
  branch_name: 'Quetzaltenango',
};

describe('SystemBusOptionsService', () => {
  const setup = (answers: unknown[][]) => {
    const queryRaw = jest.fn();
    for (const answer of answers) queryRaw.mockResolvedValueOnce(answer);
    const prisma = {
      $queryRaw: queryRaw,
      $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    return { queryRaw, service: new SystemBusOptionsService(prisma as never) };
  };

  it('answers a page of buses with the total of the search', async () => {
    const { service, queryRaw } = setup([[bus], [{ buses: 7 }]]);

    const page = await service.page({ q: 'volvo', page: 2, pageSize: 5 });

    expect(page).toMatchObject({ total: 7, page: 2, pageSize: 5 });
    expect(page.items).toEqual([
      {
        id: bus.id,
        plate: 'C482BTX',
        brand: 'Volvo',
        model: 'B8R',
        branchName: 'Quetzaltenango',
      },
    ]);
    expect(page.summary).toEqual({ totals: { buses: 7 }, groups: [] });
    expect(queryRaw.mock.calls[0]?.[0].sql).toContain('LIMIT');
  });

  it('answers an empty page when no bus matched', async () => {
    const { service } = setup([[], []]);

    const page = await service.page({ page: 1, pageSize: 100 });

    expect(page).toMatchObject({ items: [], total: 0 });
    expect(page.summary.totals).toEqual({ buses: 0 });
  });
});
