import { REPORT_PDF_MAX_ROWS } from '@debus/contracts';
import { ConflictException } from '@nestjs/common';
import { SystemRepairExpensesService } from './system-repair-expenses.service';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const busId = '1f0e2d3c-4b5a-4968-8776-655443322110';
const line = {
  expense_id: '5d4e3f2a-8b7c-4d6e-9f0a-1b2c3d4e5f6a',
  line_no: 0,
  category_id: '6e5f4a3b-9c8d-4e7f-8a0b-2c3d4e5f6a7b',
  category_name: 'Llantas',
  bus_id: busId,
  bus_plate: 'C482BTX',
  branch_id: branchId,
  branch_name: 'Quetzaltenango',
  service_date: new Date('2026-10-15T00:00:00.000Z'),
  kind: 'PART',
  description: 'Dos llantas delanteras',
  amount: 2400,
};
const totalsRecord = { lines: 6, expenses: 4, amount: 9000 };
const group = {
  category_id: line.category_id,
  category_name: 'Llantas',
  lines: 6,
  amount: 9000,
};

describe('SystemRepairExpensesService', () => {
  const setup = (answers: unknown[][]) => {
    const queryRaw = jest.fn();
    for (const answer of answers) queryRaw.mockResolvedValueOnce(answer);
    const prisma = {
      $queryRaw: queryRaw,
      $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    const render = jest.fn().mockResolvedValue(Buffer.from('%PDF-'));
    const nameOf = jest.fn().mockResolvedValue('Quetzaltenango');
    const service = new SystemRepairExpensesService(
      prisma as never,
      { nameOf } as never,
      { render } as never,
    );
    return { service, queryRaw, render, nameOf };
  };
  const query = { from: '2026-10-01', page: 2, pageSize: 5 };

  it('answers a page of lines with the totals and the categories of the whole filtered set', async () => {
    const { service, queryRaw } = setup([[line], [totalsRecord], [group]]);

    const page = await service.page(query);

    expect(page).toMatchObject({ total: 6, page: 2, pageSize: 5 });
    expect(page.items[0]).toMatchObject({ expenseId: line.expense_id, lineNo: 0, kind: 'PART' });
    expect(page.summary.totals).toEqual(totalsRecord);
    expect(page.summary.groups).toEqual([
      { categoryId: line.category_id, categoryName: 'Llantas', lines: 6, amount: 9000 },
    ]);
    expect(queryRaw.mock.calls[0]?.[0].sql).toContain('LIMIT');
  });

  it('answers an empty page with zero totals when nothing matched', async () => {
    const { service } = setup([[], [], []]);

    const page = await service.page(query);

    expect(page).toMatchObject({ items: [], total: 0 });
    expect(page.summary).toEqual({ totals: { lines: 0, expenses: 0, amount: 0 }, groups: [] });
  });

  it('renders every filtered line without paging', async () => {
    const { service, queryRaw, render, nameOf } = setup([[totalsRecord], [line], [group]]);

    const buffer = await service.pdf(query);

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(nameOf).not.toHaveBeenCalled();
    expect(queryRaw).toHaveBeenCalledTimes(3);
    expect(queryRaw.mock.calls[1]?.[0].sql).not.toContain('LIMIT');
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'Todas las sucursales', filters: [] }),
    );
  });

  it('names the branch and the bus that were chosen in the PDF', async () => {
    const { service, render, nameOf } = setup([
      [totalsRecord],
      [line],
      [group],
      [{ plate: 'C482BTX' }],
    ]);

    await service.pdf({ ...query, branchId, busId });

    expect(nameOf).toHaveBeenCalledWith(branchId);
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['Sucursal: Quetzaltenango', 'Bus: C-482BTX'] }),
    );
  });

  it('says there is no data for a branch or a bus that is not copied', async () => {
    const { service, render, nameOf } = setup([[totalsRecord], [line], [group], []]);
    nameOf.mockResolvedValueOnce(null);

    await service.pdf({ ...query, branchId, busId });

    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['Sucursal: Sucursal sin datos', 'Bus: Bus sin datos'] }),
    );
  });

  it('refuses a PDF with more lines than the limit before reading them', async () => {
    const { service, queryRaw, render } = setup([
      [{ ...totalsRecord, lines: REPORT_PDF_MAX_ROWS + 1 }],
    ]);

    await expect(service.pdf(query)).rejects.toBeInstanceOf(ConflictException);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });
});
