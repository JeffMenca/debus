import { REPORT_PDF_MAX_ROWS } from '@debus/contracts';
import { ConflictException } from '@nestjs/common';
import { SystemIncomeService } from './system-income.service';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const entry = {
  id: '1f0e2d3c-4b5a-4968-8776-655443322110',
  branch_id: branchId,
  branch_name: 'Quetzaltenango',
  channel: 'COUNTER',
  day: new Date('2026-10-20T00:00:00.000Z'),
  origin_label: 'Quetzaltenango',
  destination_label: 'Guatemala',
  client_name: null,
  quantity: 1,
  amount: 85,
};
const totalsRecord = {
  entries: 6,
  amount: 1190,
  online_tickets: 700,
  counter_tickets: 90,
  rentals: 400,
};
const group = { branch_id: branchId, branch_name: 'Quetzaltenango', entries: 6, amount: 1190 };

describe('SystemIncomeService', () => {
  const setup = (answers: unknown[][]) => {
    const queryRaw = jest.fn();
    for (const answer of answers) queryRaw.mockResolvedValueOnce(answer);
    const prisma = {
      $queryRaw: queryRaw,
      $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    const render = jest.fn().mockResolvedValue(Buffer.from('%PDF-'));
    const nameOf = jest.fn().mockResolvedValue('Quetzaltenango');
    const service = new SystemIncomeService(
      prisma as never,
      { nameOf } as never,
      { render } as never,
    );
    return { service, queryRaw, render, nameOf };
  };
  const query = { from: '2026-10-01', page: 2, pageSize: 5 };

  it('answers a page of sales with the totals and the branches of the whole filtered set', async () => {
    const { service, queryRaw } = setup([[entry], [totalsRecord], [group]]);

    const page = await service.page(query);

    expect(page).toMatchObject({ total: 6, page: 2, pageSize: 5 });
    expect(page.items[0]).toMatchObject({ id: entry.id, concept: 'COUNTER_TICKET', amount: 85 });
    expect(page.summary.totals).toEqual({
      entries: 6,
      amount: 1190,
      onlineTickets: 700,
      counterTickets: 90,
      rentals: 400,
    });
    expect(page.summary.groups).toEqual([
      { branchId, branchName: 'Quetzaltenango', entries: 6, amount: 1190 },
    ]);
    expect(queryRaw.mock.calls[0]?.[0].sql).toContain('LIMIT');
  });

  it('answers an empty page with zero totals when nothing matched', async () => {
    const { service } = setup([[], [], []]);

    const page = await service.page(query);

    expect(page).toMatchObject({ items: [], total: 0 });
    expect(page.summary.totals.amount).toBe(0);
    expect(page.summary.groups).toEqual([]);
  });

  it('renders every filtered sale without paging', async () => {
    const { service, queryRaw, render, nameOf } = setup([[totalsRecord], [entry], [group]]);

    const buffer = await service.pdf(query);

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(nameOf).not.toHaveBeenCalled();
    expect(queryRaw).toHaveBeenCalledTimes(3);
    expect(queryRaw.mock.calls[1]?.[0].sql).not.toContain('LIMIT');
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'Todas las sucursales',
        period: 'Desde el 1 oct. 2026',
        filters: [],
      }),
    );
  });

  it('names the branch that was chosen in the PDF', async () => {
    const { service, render, nameOf } = setup([[totalsRecord], [entry], [group]]);

    await service.pdf({ ...query, branchId });

    expect(nameOf).toHaveBeenCalledWith(branchId);
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['Sucursal: Quetzaltenango'] }),
    );
  });

  it('says there is no data for a chosen branch that is not copied yet', async () => {
    const { service, render, nameOf } = setup([[totalsRecord], [entry], [group]]);
    nameOf.mockResolvedValueOnce(null);

    await service.pdf({ ...query, branchId });

    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['Sucursal: Sucursal sin datos'] }),
    );
  });

  it('refuses a PDF with more sales than the limit before reading them', async () => {
    const { service, queryRaw, render } = setup([
      [{ ...totalsRecord, entries: REPORT_PDF_MAX_ROWS + 1 }],
    ]);

    await expect(service.pdf(query)).rejects.toBeInstanceOf(ConflictException);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });
});
