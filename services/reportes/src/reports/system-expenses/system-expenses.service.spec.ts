import { REPORT_PDF_MAX_ROWS } from '@debus/contracts';
import { ConflictException } from '@nestjs/common';
import { SystemExpensesService } from './system-expenses.service';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const entry = {
  id: '1f0e2d3c-4b5a-4968-8776-655443322110:FUEL',
  branch_id: branchId,
  branch_name: 'Quetzaltenango',
  concept: 'FUEL',
  day: new Date('2026-10-20T00:00:00.000Z'),
  bus_plate: 'C482BTX',
  origin_label: 'Quetzaltenango',
  destination_label: 'Guatemala',
  category_name: null,
  description: null,
  amount: 1250,
};
const totalsRecord = {
  entries: 6,
  amount: 4000,
  fuel: 1250,
  depreciation: 303,
  labor: 450,
  parts: 1997,
};
const group = { branch_id: branchId, branch_name: 'Quetzaltenango', entries: 6, amount: 4000 };

describe('SystemExpensesService', () => {
  const setup = (answers: unknown[][]) => {
    const queryRaw = jest.fn();
    for (const answer of answers) queryRaw.mockResolvedValueOnce(answer);
    const prisma = {
      $queryRaw: queryRaw,
      $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    const render = jest.fn().mockResolvedValue(Buffer.from('%PDF-'));
    const nameOf = jest.fn().mockResolvedValue('Quetzaltenango');
    const service = new SystemExpensesService(
      prisma as never,
      { nameOf } as never,
      { render } as never,
    );
    return { service, queryRaw, render, nameOf };
  };
  const query = { from: '2026-10-01', page: 2, pageSize: 5 };

  it('answers a page of expenses with the totals and the branches of the whole filtered set', async () => {
    const { service, queryRaw } = setup([[entry], [totalsRecord], [group]]);

    const page = await service.page(query);

    expect(page).toMatchObject({ total: 6, page: 2, pageSize: 5 });
    expect(page.items[0]).toMatchObject({ id: entry.id, concept: 'FUEL', busPlate: 'C482BTX' });
    expect(page.summary.totals).toEqual(totalsRecord);
    expect(page.summary.groups).toEqual([
      { branchId, branchName: 'Quetzaltenango', entries: 6, amount: 4000 },
    ]);
    expect(queryRaw.mock.calls[0]?.[0].sql).toContain('LIMIT');
  });

  it('answers an empty page with zero totals when nothing matched', async () => {
    const { service } = setup([[], [], []]);

    const page = await service.page(query);

    expect(page).toMatchObject({ items: [], total: 0 });
    expect(page.summary.totals.amount).toBe(0);
  });

  it('renders every filtered expense without paging', async () => {
    const { service, queryRaw, render, nameOf } = setup([[totalsRecord], [entry], [group]]);

    const buffer = await service.pdf(query);

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(nameOf).not.toHaveBeenCalled();
    expect(queryRaw.mock.calls[1]?.[0].sql).not.toContain('LIMIT');
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'Todas las sucursales', filters: [] }),
    );
  });

  it('names the branch that was chosen in the PDF, or says there is no data', async () => {
    const first = setup([[totalsRecord], [entry], [group]]);
    await first.service.pdf({ ...query, branchId });
    expect(first.render).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['Sucursal: Quetzaltenango'] }),
    );

    const second = setup([[totalsRecord], [entry], [group]]);
    second.nameOf.mockResolvedValueOnce(null);
    await second.service.pdf({ ...query, branchId });
    expect(second.render).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['Sucursal: Sucursal sin datos'] }),
    );
  });

  it('refuses a PDF with more expenses than the limit before reading them', async () => {
    const { service, queryRaw, render } = setup([
      [{ ...totalsRecord, entries: REPORT_PDF_MAX_ROWS + 1 }],
    ]);

    await expect(service.pdf(query)).rejects.toBeInstanceOf(ConflictException);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });
});
