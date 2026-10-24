import { REPORT_PDF_MAX_ROWS } from '@debus/contracts';
import { ConflictException } from '@nestjs/common';
import { SystemTopRoutesService } from './system-top-routes.service';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const route = {
  position: 1,
  route_id: '3b2c1d0e-6f5a-4b4c-9d8e-7f6a5b4c3d2e',
  branch_id: branchId,
  origin_label: 'Quetzaltenango',
  destination_label: 'Guatemala',
  distance_km: 201.5,
  ticket_price: 85,
  active: true,
  trips: 2,
  online_tickets: 3,
  counter_tickets: 1,
  tickets: 4,
  income: 340,
};
const totalsRecord = { routes: 2, trips: 3, tickets: 16, income: 1360 };

describe('SystemTopRoutesService', () => {
  const setup = (answers: unknown[][]) => {
    const queryRaw = jest.fn();
    for (const answer of answers) queryRaw.mockResolvedValueOnce(answer);
    const prisma = {
      $queryRaw: queryRaw,
      $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    const render = jest.fn().mockResolvedValue(Buffer.from('%PDF-'));
    const nameOf = jest.fn().mockResolvedValue('Quetzaltenango');
    const service = new SystemTopRoutesService(
      prisma as never,
      { nameOf } as never,
      { render } as never,
    );
    return { service, queryRaw, render, nameOf };
  };
  const query = { from: '2026-10-01', page: 2, pageSize: 5 };

  it('answers a page of routes with their share of the tickets of the whole filtered set', async () => {
    const { service, queryRaw } = setup([[route], [totalsRecord]]);

    const page = await service.page(query);

    expect(page).toMatchObject({ total: 2, page: 2, pageSize: 5 });
    expect(page.items[0]).toMatchObject({ position: 1, tickets: 4, share: 25, distanceKm: 201.5 });
    expect(page.summary).toEqual({ totals: totalsRecord, groups: [] });
    expect(queryRaw.mock.calls[0]?.[0].sql).toContain('LIMIT');
  });

  it('answers an empty page with zero totals when nothing matched', async () => {
    const { service } = setup([[], []]);

    const page = await service.page(query);

    expect(page).toMatchObject({ items: [], total: 0 });
    expect(page.summary.totals).toEqual({ routes: 0, trips: 0, tickets: 0, income: 0 });
  });

  it('renders every filtered route without paging', async () => {
    const { service, queryRaw, render, nameOf } = setup([[totalsRecord], [route]]);

    const buffer = await service.pdf(query);

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(nameOf).not.toHaveBeenCalled();
    expect(queryRaw.mock.calls[1]?.[0].sql).not.toContain('LIMIT');
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'Todas las sucursales', filters: [] }),
    );
  });

  it('names the origin branch that was chosen in the PDF, or says there is no data', async () => {
    const first = setup([[totalsRecord], [route]]);
    await first.service.pdf({ ...query, branchId });
    expect(first.render).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['Sucursal de origen: Quetzaltenango'] }),
    );

    const second = setup([[totalsRecord], [route]]);
    second.nameOf.mockResolvedValueOnce(null);
    await second.service.pdf({ ...query, branchId });
    expect(second.render).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['Sucursal de origen: Sucursal sin datos'] }),
    );
  });

  it('refuses a PDF with more routes than the limit before reading them', async () => {
    const { service, queryRaw, render } = setup([
      [{ ...totalsRecord, routes: REPORT_PDF_MAX_ROWS + 1 }],
    ]);

    await expect(service.pdf(query)).rejects.toBeInstanceOf(ConflictException);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });
});
