import { REPORT_PDF_MAX_ROWS } from '@debus/contracts';
import { ConflictException } from '@nestjs/common';
import { BranchRentalIncomeService } from './branch-rental-income.service';

const rental = {
  id: '1f0e2d3c-4b5a-4968-8776-655443322110',
  client_name: 'Colegio San José',
  nit: '1234567-8',
  origin_label: 'Quetzaltenango',
  destination_label: 'Panajachel',
  departure_at: new Date('2026-10-24T13:00:00.000Z'),
  return_at: null,
  paid_on: new Date('2026-10-21T00:00:00.000Z'),
  passengers: 35,
  bus_plate: 'C482BTX',
  price: 2760,
};

describe('BranchRentalIncomeService', () => {
  const setup = (answers: unknown[][]) => {
    const queryRaw = jest.fn();
    for (const answer of answers) queryRaw.mockResolvedValueOnce(answer);
    const prisma = {
      $queryRaw: queryRaw,
      $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    const render = jest.fn().mockResolvedValue(Buffer.from('%PDF-'));
    const nameOf = jest.fn().mockResolvedValue('Quetzaltenango');
    const service = new BranchRentalIncomeService(
      prisma as never,
      { nameOf } as never,
      { render } as never,
    );
    return { service, queryRaw, render, nameOf };
  };
  const query = { from: '2026-10-01', q: 'colegio', page: 2, pageSize: 5 };

  it('answers a page of rentals with the totals of the whole filtered set and no groups', async () => {
    const { service, queryRaw } = setup([[rental], [{ rentals: 6, income: 9000 }]]);

    const page = await service.page('branch-1', query);

    expect(page).toMatchObject({ total: 6, page: 2, pageSize: 5 });
    expect(page.items[0]).toMatchObject({ rentalId: rental.id, busPlate: 'C482BTX', price: 2760 });
    expect(page.summary).toEqual({ totals: { rentals: 6, income: 9000 }, groups: [] });
    expect(queryRaw.mock.calls[0]?.[0].sql).toContain('OFFSET');
  });

  it('answers an empty page with zero totals when nothing matched', async () => {
    const { service } = setup([[], []]);

    const page = await service.page('branch-1', query);

    expect(page).toMatchObject({ items: [], total: 0 });
    expect(page.summary.totals).toEqual({ rentals: 0, income: 0 });
  });

  it('renders every filtered rental without paging', async () => {
    const { service, queryRaw, render, nameOf } = setup([[{ rentals: 1, income: 2760 }], [rental]]);

    const buffer = await service.pdf('branch-1', query);

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(nameOf).toHaveBeenCalledWith('branch-1');
    expect(queryRaw.mock.calls[1]?.[0].sql).not.toContain('OFFSET');
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'Sucursal Quetzaltenango',
        period: 'Desde el 1 oct. 2026',
        filters: ['Búsqueda: colegio'],
      }),
    );
  });

  it('refuses a PDF with more rentals than the limit before reading them', async () => {
    const { service, queryRaw, render } = setup([
      [{ rentals: REPORT_PDF_MAX_ROWS + 1, income: 0 }],
    ]);

    await expect(service.pdf('branch-1', query)).rejects.toBeInstanceOf(ConflictException);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });
});
