import { REPORT_PDF_MAX_ROWS } from '@debus/contracts';
import { ConflictException } from '@nestjs/common';
import { BranchRepairExpensesService } from './branch-repair-expenses.service';

const bus = {
  id: '1f0e2d3c-4b5a-4968-8776-655443322110',
  plate: 'C482BTX',
  brand: 'Volvo',
  model: 'B8R',
  expenses: 2,
  total: 2300,
};
const motor = {
  bus_id: bus.id,
  category_id: 'a1000000-4b5a-4968-8776-655443322110',
  category_name: 'Motor',
  lines: 2,
  amount: 1500,
};
const tires = {
  ...motor,
  category_id: 'a2000000-4b5a-4968-8776-655443322110',
  category_name: 'Llantas',
  lines: 1,
  amount: 800,
};
const group = (record: typeof motor) => ({
  category_id: record.category_id,
  category_name: record.category_name,
  lines: record.lines,
  amount: record.amount,
});

describe('BranchRepairExpensesService', () => {
  const setup = (answers: unknown[][]) => {
    const queryRaw = jest.fn();
    for (const answer of answers) queryRaw.mockResolvedValueOnce(answer);
    const prisma = {
      $queryRaw: queryRaw,
      $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    const render = jest.fn().mockResolvedValue(Buffer.from('%PDF-'));
    const nameOf = jest.fn().mockResolvedValue('Quetzaltenango');
    const service = new BranchRepairExpensesService(
      prisma as never,
      { nameOf } as never,
      { render } as never,
    );
    return { service, queryRaw, render, nameOf };
  };
  const query = { from: '2026-10-01', page: 2, pageSize: 5 };

  it('answers a page with the categories of its buses and the totals of the whole filtered set', async () => {
    const { service, queryRaw } = setup([
      [bus],
      [{ buses: 6, expenses: 9, total: 5000 }],
      [group(motor), group(tires)],
      [tires, motor],
    ]);

    const page = await service.page('branch-1', query);

    expect(page).toMatchObject({ total: 6, page: 2, pageSize: 5 });
    expect(page.items[0]).toMatchObject({ plate: 'C482BTX', total: 2300 });
    expect(page.items[0]?.categories.map((c) => c.categoryName)).toEqual(['Motor', 'Llantas']);
    expect(page.summary.totals).toEqual({ buses: 6, expenses: 9, total: 5000 });
    expect(page.summary.groups.map((g) => g.categoryName)).toEqual(['Motor', 'Llantas']);
    expect(queryRaw).toHaveBeenCalledTimes(4);
    expect(queryRaw.mock.calls[0]?.[0].sql).toContain('LIMIT');
    expect(queryRaw.mock.calls[3]?.[0].values).toContainEqual([bus.id]);
  });

  it('does not look for categories when the page has no buses', async () => {
    const { service, queryRaw } = setup([[], [{ buses: 0, expenses: 0, total: 0 }], []]);

    const page = await service.page('branch-1', query);

    expect(page.items).toEqual([]);
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });

  it('renders every filtered bus without paging', async () => {
    const { service, queryRaw, render, nameOf } = setup([
      [{ buses: 1, expenses: 2, total: 2300 }],
      [bus],
      [motor, tires],
      [group(motor), group(tires)],
    ]);

    const buffer = await service.pdf('branch-1', query);

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(nameOf).toHaveBeenCalledWith('branch-1');
    expect(queryRaw).toHaveBeenCalledTimes(4);
    expect(queryRaw.mock.calls[1]?.[0].sql).not.toContain('LIMIT');
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'Sucursal Quetzaltenango',
        period: 'Desde el 1 oct. 2026',
        filters: [],
      }),
    );
  });

  it('names the bus and the category that were chosen in the PDF', async () => {
    const { service, render } = setup([
      [{ buses: 1, expenses: 1, total: 1500 }],
      [bus],
      [motor],
      [group(motor)],
      [{ bus_plate: 'C482BTX', category_name: 'Motor' }],
    ]);

    await service.pdf('branch-1', { ...query, busId: bus.id, categoryId: motor.category_id });

    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['Bus: C-482BTX', 'Categoría: Motor'] }),
    );
  });

  it('says a bus without data when the chosen bus has no copy', async () => {
    const { service, render } = setup([
      [{ buses: 0, expenses: 0, total: 0 }],
      [],
      [],
      [],
      [{ bus_plate: null, category_name: null }],
    ]);

    await service.pdf('branch-1', { ...query, busId: bus.id });

    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['Bus: Bus sin datos'] }),
    );
  });

  it('refuses a PDF with more buses than the limit before reading them', async () => {
    const { service, queryRaw, render } = setup([
      [{ buses: REPORT_PDF_MAX_ROWS + 1, expenses: 0, total: 0 }],
    ]);

    await expect(service.pdf('branch-1', query)).rejects.toBeInstanceOf(ConflictException);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });
});
