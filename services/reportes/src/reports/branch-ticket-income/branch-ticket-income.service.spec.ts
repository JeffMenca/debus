import { REPORT_PDF_MAX_ROWS } from '@debus/contracts';
import { ConflictException } from '@nestjs/common';
import { BranchTicketIncomeService } from './branch-ticket-income.service';

const trip = {
  trip_id: '1f0e2d3c-4b5a-4968-8776-655443322110',
  departure_at: new Date('2026-10-20T11:30:00.000Z'),
  route_id: 'a1000000-4b5a-4968-8776-655443322110',
  origin_label: 'Quetzaltenango',
  destination_label: 'Guatemala',
  bus_id: 'b1000000-4b5a-4968-8776-655443322110',
  bus_plate: 'C482BTX',
  tickets: 3,
  online_tickets: 2,
  counter_tickets: 1,
  income: 255,
};
const group = {
  route_id: trip.route_id,
  origin_label: 'Quetzaltenango',
  destination_label: 'Guatemala',
  tickets: 3,
  income: 255,
};

describe('BranchTicketIncomeService', () => {
  const setup = (answers: unknown[][]) => {
    const queryRaw = jest.fn();
    for (const answer of answers) queryRaw.mockResolvedValueOnce(answer);
    const prisma = {
      $queryRaw: queryRaw,
      $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    const render = jest.fn().mockResolvedValue(Buffer.from('%PDF-'));
    const nameOf = jest.fn().mockResolvedValue('Quetzaltenango');
    const service = new BranchTicketIncomeService(
      prisma as never,
      { nameOf } as never,
      { render } as never,
    );
    return { service, queryRaw, render, nameOf };
  };
  const query = { from: '2026-10-01', page: 2, pageSize: 5 };

  it('answers a page of trips with the totals and the routes of the whole filtered set', async () => {
    const { service, queryRaw } = setup([
      [trip],
      [{ trips: 6, tickets: 14, income: 1190 }],
      [group],
    ]);

    const page = await service.page('branch-1', query);

    expect(page).toMatchObject({ total: 6, page: 2, pageSize: 5 });
    expect(page.items[0]).toMatchObject({ tripId: trip.trip_id, busPlate: 'C482BTX', income: 255 });
    expect(page.summary.totals).toEqual({ trips: 6, tickets: 14, income: 1190 });
    expect(page.summary.groups).toEqual([
      {
        routeId: trip.route_id,
        originLabel: 'Quetzaltenango',
        destinationLabel: 'Guatemala',
        tickets: 3,
        income: 255,
      },
    ]);
    expect(queryRaw.mock.calls[0]?.[0].sql).toContain('LIMIT');
  });

  it('answers an empty page with zero totals when nothing matched', async () => {
    const { service } = setup([[], [], []]);

    const page = await service.page('branch-1', query);

    expect(page).toMatchObject({ items: [], total: 0 });
    expect(page.summary).toEqual({ totals: { trips: 0, tickets: 0, income: 0 }, groups: [] });
  });

  it('renders every filtered trip without paging', async () => {
    const { service, queryRaw, render, nameOf } = setup([
      [{ trips: 1, tickets: 3, income: 255 }],
      [trip],
      [group],
    ]);

    const buffer = await service.pdf('branch-1', query);

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(nameOf).toHaveBeenCalledWith('branch-1');
    expect(queryRaw).toHaveBeenCalledTimes(3);
    expect(queryRaw.mock.calls[1]?.[0].sql).not.toContain('LIMIT');
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'Sucursal Quetzaltenango',
        period: 'Desde el 1 oct. 2026',
        filters: [],
      }),
    );
  });

  it('names the route and the bus that were chosen in the PDF', async () => {
    const { service, render } = setup([
      [{ trips: 1, tickets: 3, income: 255 }],
      [trip],
      [group],
      [{ origin_label: 'Quetzaltenango', destination_label: 'Guatemala', bus_plate: 'C482BTX' }],
    ]);

    await service.pdf('branch-1', { ...query, routeId: trip.route_id, busId: trip.bus_id });

    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: ['Ruta: Quetzaltenango – Guatemala', 'Bus: C-482BTX'],
      }),
    );
  });

  it('says there is no data when the chosen route and bus are unknown', async () => {
    const { service, render } = setup([
      [{ trips: 0, tickets: 0, income: 0 }],
      [],
      [],
      [{ origin_label: null, destination_label: null, bus_plate: null }],
    ]);

    await service.pdf('branch-1', { ...query, routeId: trip.route_id, busId: trip.bus_id });

    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['Ruta: Ruta sin datos', 'Bus: Bus sin datos'] }),
    );
  });

  it('refuses a PDF with more trips than the limit before reading them', async () => {
    const { service, queryRaw, render } = setup([
      [{ trips: REPORT_PDF_MAX_ROWS + 1, tickets: 0, income: 0 }],
    ]);

    await expect(service.pdf('branch-1', query)).rejects.toBeInstanceOf(ConflictException);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });
});
