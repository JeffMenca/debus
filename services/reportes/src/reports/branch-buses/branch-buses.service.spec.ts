import { REPORT_PDF_MAX_ROWS } from '@debus/contracts';
import { ConflictException } from '@nestjs/common';
import { BranchBusesService } from './branch-buses.service';

const raw = {
  id: '1f0e2d3c-4b5a-4968-8776-655443322110',
  plate: 'C482BTX',
  brand: 'Volvo',
  model: 'B8R',
  capacity: 40,
  mileage_km: 1000,
  driver_name: null,
  completed_trips: 1,
  last_mileage_km: null,
  status: 'AVAILABLE' as const,
};

describe('BranchBusesService', () => {
  const setup = (answers: unknown[][]) => {
    const queryRaw = jest.fn();
    for (const answer of answers) queryRaw.mockResolvedValueOnce(answer);
    const prisma = {
      $queryRaw: queryRaw,
      $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    const render = jest.fn().mockResolvedValue(Buffer.from('%PDF-'));
    const nameOf = jest.fn().mockResolvedValue('Quetzaltenango');
    const service = new BranchBusesService(
      prisma as never,
      { nameOf } as never,
      { render } as never,
    );
    return { service, queryRaw, render, nameOf };
  };
  const query = { status: 'all' as const, page: 2, pageSize: 5 };

  it('answers a page with the totals and the groups of the whole filtered set', async () => {
    const { service, queryRaw } = setup([
      [raw],
      [{ buses: 6, completed_trips: 3 }],
      [{ status: 'AVAILABLE', buses: 6 }],
    ]);

    const page = await service.page('branch-1', query);

    expect(page).toMatchObject({ total: 6, page: 2, pageSize: 5 });
    expect(page.items).toHaveLength(1);
    expect(page.summary.totals).toEqual({ buses: 6, completedTrips: 3 });
    expect(page.summary.groups).toHaveLength(4);
    expect(queryRaw).toHaveBeenCalledTimes(3);
    expect(queryRaw.mock.calls[0]?.[0].sql).toContain('LIMIT');
  });

  it('renders every filtered row without paging', async () => {
    const { service, queryRaw, render, nameOf } = setup([
      [{ buses: 1, completed_trips: 1 }],
      [raw],
    ]);

    const buffer = await service.pdf('branch-1', query);

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(nameOf).toHaveBeenCalledWith('branch-1');
    expect(queryRaw.mock.calls[1]?.[0].sql).not.toContain('LIMIT');
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'Sucursal Quetzaltenango',
        title: 'Listado general de buses',
      }),
    );
  });

  it('refuses a PDF with more rows than the limit before reading them', async () => {
    const { service, queryRaw, render } = setup([
      [{ buses: REPORT_PDF_MAX_ROWS + 1, completed_trips: 0 }],
    ]);

    await expect(service.pdf('branch-1', query)).rejects.toBeInstanceOf(ConflictException);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });
});
