import { REPORT_PDF_MAX_ROWS } from '@debus/contracts';
import { ConflictException } from '@nestjs/common';
import { BranchDepreciationService } from './branch-depreciation.service';

const raw = {
  id: '1f0e2d3c-4b5a-4968-8776-655443322110',
  plate: 'C482BTX',
  brand: 'Volvo',
  model: 'B8R',
  trips: 2,
  km: 300,
  accumulated: 400,
};

describe('BranchDepreciationService', () => {
  const setup = (answers: unknown[][]) => {
    const queryRaw = jest.fn();
    for (const answer of answers) queryRaw.mockResolvedValueOnce(answer);
    const prisma = {
      $queryRaw: queryRaw,
      $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    const render = jest.fn().mockResolvedValue(Buffer.from('%PDF-'));
    const nameOf = jest.fn().mockResolvedValue('Quetzaltenango');
    const service = new BranchDepreciationService(
      prisma as never,
      { nameOf } as never,
      { render } as never,
    );
    return { service, queryRaw, render, nameOf };
  };
  const query = { from: '2026-10-01', page: 2, pageSize: 5 };

  it('answers a page with the totals of the whole filtered set and the rate in force', async () => {
    const { service, queryRaw } = setup([
      [raw],
      [{ buses: 6, km: 900, accumulated: 1200.5 }],
      [{ depreciation_per_km: 1.5 }],
    ]);

    const page = await service.page('branch-1', query);

    expect(page).toMatchObject({ total: 6, page: 2, pageSize: 5 });
    expect(page.items[0]).toMatchObject({ plate: 'C482BTX', appliedPerKm: 1.33 });
    expect(page.summary).toEqual({
      totals: { kmTraveled: 900, accumulated: 1200.5, currentPerKm: 1.5 },
      groups: [],
    });
    expect(queryRaw).toHaveBeenCalledTimes(3);
    expect(queryRaw.mock.calls[0]?.[0].sql).toContain('LIMIT');
    expect(queryRaw.mock.calls[0]?.[0].values).toContainEqual(new Date('2026-10-01T06:00:00.000Z'));
  });

  it('renders every filtered row without paging', async () => {
    const { service, queryRaw, render, nameOf } = setup([
      [{ buses: 1, km: 300, accumulated: 400 }],
      [raw],
      [],
    ]);

    const buffer = await service.pdf('branch-1', query);

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(nameOf).toHaveBeenCalledWith('branch-1');
    expect(queryRaw.mock.calls[1]?.[0].sql).not.toContain('LIMIT');
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'Sucursal Quetzaltenango',
        title: 'Depreciación por bus',
        period: 'Desde el 1 oct. 2026',
      }),
    );
  });

  it('refuses a PDF with more rows than the limit before reading them', async () => {
    const { service, queryRaw, render } = setup([
      [{ buses: REPORT_PDF_MAX_ROWS + 1, km: 0, accumulated: 0 }],
    ]);

    await expect(service.pdf('branch-1', query)).rejects.toBeInstanceOf(ConflictException);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });
});
