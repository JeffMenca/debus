import { REPORT_PDF_MAX_ROWS } from '@debus/contracts';
import { ConflictException } from '@nestjs/common';
import { SystemProfitService } from './system-profit.service';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const record = {
  branch_id: branchId,
  branch_name: 'Quetzaltenango',
  ticket_income: 255,
  rental_income: 2760,
  fuel: 1180,
  labor: 350.5,
  parts: 5200,
  depreciation: 306,
};

describe('SystemProfitService', () => {
  const setup = (answers: unknown[][]) => {
    const queryRaw = jest.fn();
    for (const answer of answers) queryRaw.mockResolvedValueOnce(answer);
    const prisma = {
      $queryRaw: queryRaw,
      $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    const render = jest.fn().mockResolvedValue(Buffer.from('%PDF-'));
    const nameOf = jest.fn().mockResolvedValue('Quetzaltenango');
    const service = new SystemProfitService(
      prisma as never,
      { nameOf } as never,
      { render } as never,
    );
    return { service, queryRaw, render, nameOf };
  };
  const query = { from: '2026-10-01', page: 1, pageSize: 5 };

  it('answers a page of branches with the totals of the whole filtered set', async () => {
    const { service, queryRaw } = setup([[record], [{ ...record, branches: 7 }]]);

    const page = await service.page(query);

    expect(page).toMatchObject({ total: 7, page: 1, pageSize: 5 });
    expect(page.items[0]).toMatchObject({
      branchId,
      income: 3015,
      expenses: 7036.5,
      profit: -4021.5,
    });
    expect(page.summary.totals).toMatchObject({ income: 3015, profit: -4021.5, margin: -133.4 });
    expect(page.summary.groups).toEqual([]);
    expect(queryRaw.mock.calls[0]?.[0].sql).toContain('LIMIT');
  });

  it('answers an empty page with zero totals when no branch matched', async () => {
    const { service } = setup([[], []]);

    const page = await service.page(query);

    expect(page).toMatchObject({ items: [], total: 0 });
    expect(page.summary.totals).toMatchObject({ income: 0, profit: 0, margin: null });
  });

  it('renders every filtered branch without paging', async () => {
    const { service, queryRaw, render, nameOf } = setup([[{ ...record, branches: 1 }], [record]]);

    const buffer = await service.pdf(query);

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(nameOf).not.toHaveBeenCalled();
    expect(queryRaw.mock.calls[1]?.[0].sql).not.toContain('LIMIT');
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'Todas las sucursales', filters: [] }),
    );
  });

  it('names the branch that was chosen in the PDF, or says there is no data', async () => {
    const first = setup([[{ ...record, branches: 1 }], [record]]);
    await first.service.pdf({ ...query, branchId });
    expect(first.render).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['Sucursal: Quetzaltenango'] }),
    );

    const second = setup([[{ ...record, branches: 1 }], [record]]);
    second.nameOf.mockResolvedValueOnce(null);
    await second.service.pdf({ ...query, branchId });
    expect(second.render).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['Sucursal: Sucursal sin datos'] }),
    );
  });

  it('refuses a PDF with more branches than the limit before reading them', async () => {
    const { service, queryRaw, render } = setup([
      [{ ...record, branches: REPORT_PDF_MAX_ROWS + 1 }],
    ]);

    await expect(service.pdf(query)).rejects.toBeInstanceOf(ConflictException);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });
});
